import { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut, dialog, protocol, safeStorage, shell, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'fs-extra';
const { writeFile, stat, ensureDir, remove } = pkg;
import os from 'os';
import PptxGenJS from 'pptxgenjs';
import { HotkeyScreenCaptureService } from './services/HotkeyScreenCaptureService.js';
import { AutoCaptureService } from './services/AutoCaptureService.js';
import { CaptureOverlayService } from './services/CaptureOverlayService.js';
import storageService from './services/StorageService.js';
import translationModuleManager from './services/TranslationModuleManager.js';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;
import logPkg from 'electron-log';
const log = logPkg;

// In packaged builds, app.isPackaged is true; during local dev it's false.
// Define this FIRST before any code that uses it
const isDev = !app.isPackaged;

// Windows user32 FFI — replaces powershell.exe spawns for GetWindowRect.
// Previously each bounds refresh forked PowerShell + invoked Add-Type (csc.exe compile),
// which under Citrix/EDR load snowballed into thousands of orphan processes.
let getWindowRectFFI = null;
let getForegroundWindowFFI = null;
if (process.platform === 'win32') {
  try {
    const koffi = (await import('koffi')).default;
    const user32 = koffi.load('user32.dll');
    const RECT = koffi.struct('RECT', {
      left: 'int32',
      top: 'int32',
      right: 'int32',
      bottom: 'int32',
    });
    getWindowRectFFI = user32.func('bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ RECT* lpRect)');
    getForegroundWindowFFI = user32.func('intptr_t __stdcall GetForegroundWindow()');
  } catch (error) {
    console.warn('Failed to load user32 FFI; window bounds unavailable:', error?.message);
  }
}



// Configure FFmpeg paths for bundled binaries
let ffmpegPath = null;
let ffprobePath = null;

try {
  if (app.isPackaged) {
    // Production: Use bundled FFmpeg binaries from resources
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      ffmpegPath = path.join(process.resourcesPath, 'ffmpeg', 'win32', arch === 'x64' ? 'x64' : 'ia32', 'ffmpeg.exe');
      ffprobePath = path.join(process.resourcesPath, 'ffmpeg', 'win32', arch === 'x64' ? 'x64' : 'ia32', 'ffprobe.exe');
    } else if (platform === 'darwin') {
      ffmpegPath = path.join(process.resourcesPath, 'ffmpeg', 'darwin', arch, 'ffmpeg');
      ffprobePath = path.join(process.resourcesPath, 'ffmpeg', 'darwin', arch, 'ffprobe');
    } else {
      ffmpegPath = path.join(process.resourcesPath, 'ffmpeg', 'linux', arch, 'ffmpeg');
      ffprobePath = path.join(process.resourcesPath, 'ffmpeg', 'linux', arch, 'ffprobe');
    }

  } else {
    // Development: Use vendored binaries fetched by scripts/fetch-ffmpeg.cjs
    // (path derived from import.meta.url because __dirname is defined later in this file)
    const publicDir = dirname(fileURLToPath(import.meta.url));
    const vendorDir = path.join(publicDir, '..', 'vendor', 'ffmpeg', 'win32', process.arch === 'x64' ? 'x64' : 'ia32');
    ffmpegPath = path.join(vendorDir, 'ffmpeg.exe');
    ffprobePath = path.join(vendorDir, 'ffprobe.exe');

    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      console.error('FFmpeg binaries not found in vendor/. Run: npm run fetch:ffmpeg');
    }
  }
} catch (error) {
  console.error('Failed to locate FFmpeg binaries');
  console.warn('⚠️  Video export features will be limited to WebM only');
}

// SECURITY: ASAR tamper protection is enforced by Electron Fuses
// (enableEmbeddedAsarIntegrityValidation + onlyLoadAppFromAsar in
// electron-builder.config.js). The fuse hash is baked into the signed
// executable and validated by Electron native code before any JS runs.

// Get the current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Console logging configuration removed - no log file created

// Set AppUserModelId for Windows taskbar/notification branding (must match electron-builder appId)
app.setAppUserModelId('com.docfai.app');

let mainWindow;

function getWindowIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app-icon.png')
    : path.join(__dirname, '..', 'src', 'assets', 'logo.png');
}

// Single instance handling
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    
    // Someone tried to run a second instance, we should focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      console.error('MainWindow not available in second instance handler');
    }
  });
}

// Global recording state
let isGlobalRecording = false;
let globalClickListener = null;
let recordedClicks = [];
let recordingStartTime = null;
let screenCaptureInterval = null;
let mouseEventListener = null;
let selectedCaptureSource = null;

// Store-compliant hotkey capture service
let hotkeyCapture = null;
let isHotkeyActive = false;

// Auto-capture service (click detection + UIAutomation)
let autoCaptureService = null;
const captureOverlay = new CaptureOverlayService();
let autoCaptureCountOffset = 0;  // Cumulative count across source switches

// Video recording state
let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;
let recordingFilePath = null;

function createWindow() {
  // Pass NODE_ENV to the renderer via command line arguments
  const envArgs = [`--env-NODE_ENV=${process.env.NODE_ENV || 'production'}`];

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Security: webSecurity enabled (default: true) - enforces same-origin policy
      // Security: allowRunningInsecureContent disabled (default: false) - blocks mixed content
      additionalArguments: envArgs, // Pass environment variables to renderer
      preload: (() => {
        const preloadPath = app.isPackaged
          ? path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'preload.cjs')
          : path.join(__dirname, 'preload.cjs');

        // Preload path resolved

        return preloadPath;
      })(),
      // SECURITY: sandbox enabled — contextBridge works correctly with sandbox: true
      sandbox: true
    },
    icon: getWindowIconPath(),
    titleBarStyle: 'hidden',
    autoHideMenuBar: true, // Hide menu bar in production
    show: false
  });

  // Set up session Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};

    // SECURITY: Set a restrictive CSP instead of stripping headers entirely.
    // unsafe-inline is kept for compatibility with the bundled React renderer.
    // connect-src allows no remote hosts: the app makes no network calls from the renderer.
    responseHeaders['content-security-policy'] = [
      "default-src 'self' file: blob: data:; " +
      "script-src 'self' 'unsafe-inline' file:; " +
      "style-src 'self' 'unsafe-inline' file: blob: data: https:; " +
      "img-src 'self' file: blob: data: safe-file: https:; " +
      "media-src 'self' file: blob: safe-file:; " +
      "font-src 'self' file: blob: data: https:; " +
      "connect-src 'self' blob:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self'; " +
      "object-src 'none'"
    ];
    delete responseHeaders['content-security-policy-report-only'];
    delete responseHeaders['x-frame-options'];

    callback({ responseHeaders });
  });

  // SECURITY: Only allow safe protocols when opening URLs externally
  function isSafeExternalUrl(url) {
    try {
      const parsed = new URL(url);
      return ['https:', 'http:', 'mailto:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  // Handle external links and new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {

    // For external URLs, validate protocol then open in default browser
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn('Blocked openExternal for unsafe URL');
    }
    return { action: 'deny' };
  });

  // Prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    // Prevent navigation to external URLs and open in system browser
    if (!navigationUrl.startsWith('http://localhost') && !navigationUrl.startsWith('file://')) {
      event.preventDefault();
      if (isSafeExternalUrl(navigationUrl)) {
        shell.openExternal(navigationUrl);
      } else {
        console.warn('Blocked will-navigate for unsafe URL');
      }
    }
  });

  // Handle console messages and filter out extension errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Filter out extension context errors that we can't control
    if (message.includes('Extension context invalidated') || 
        message.includes('chrome-extension://') ||
        message.includes('Could not establish connection')) {
      return; // Ignore these errors
    }
    
    // Log other console messages for debugging
    if (level >= 2) { // Warning and error levels
    }
  });

  // Handle unresponsive renderer process
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer process became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
  });

  // Production: no application menu (DevTools stay reachable via Ctrl+Shift+I)
  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Set zoom level to 90% after page loads (ensures consistent zoom between dev and production)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.85);
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// AUTO-UPDATE CONFIGURATION
// ============================================================================

// Configure auto-updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('Auto-updater initialized');

// Auto-update is opt-in: electron-builder only writes app-update.yml when the build
// sets DOCFAI_UPDATE_URL (see electron-builder.config.js). Without it, no update
// checks are made.
function isAutoUpdateConfigured() {
  return app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
}

/**
 * Detect if app is running from Microsoft Store
 * Store apps use Windows Update, not electron-updater
 */
function isMicrosoftStoreVersion() {
  return (
    process.windowsStore ||
    process.execPath.includes('WindowsApps') ||
    process.execPath.includes('Microsoft.WindowsStore')
  );
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  log.info('[Auto-Update] Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  log.info('[Auto-Update] Update available:', info.version);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('[Auto-Update] No updates available. Current version:', info.version);
});

autoUpdater.on('error', (error) => {
  log.error('[Auto-Update] Error:', error);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update:error', {
      message: error.message
    });
  }
});

autoUpdater.on('download-progress', (progressInfo) => {
  const percent = Math.round(progressInfo.percent);
  log.info(`[Auto-Update] Download progress: ${percent}%`);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update:progress', {
      percent: percent,
      bytesPerSecond: progressInfo.bytesPerSecond,
      total: progressInfo.total,
      transferred: progressInfo.transferred
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('[Auto-Update] Update downloaded:', info.version);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  }
});

// Register custom protocol for serving local video files
app.whenReady().then(() => {
  // Set app name for notifications
  app.setName('Docfai');
  
  // Register a custom protocol to serve local files
  protocol.registerFileProtocol('safe-file', (request, callback) => {
    const url = request.url.substr(10); // Remove 'safe-file:' prefix
    const filePath = path.normalize(decodeURIComponent(url));
    
    // Debug log removed for performance

    // Security check: allow files from recordings directory and project directories
    const userDataPath = app.getPath('userData');
    const recordingsDir = path.join(userDataPath, 'recordings');
    const projectsDir = path.join(os.homedir(), 'Documents', 'Docfai Projects');
    
    // Debug log removed for performance
    
    if (isPathInside(filePath, recordingsDir) || isPathInside(filePath, projectsDir)) {
      // Check if file exists before serving
      if (fs.existsSync(filePath)) {
        callback({ path: filePath });
      } else {
        // Debug log removed for performance
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } else {
      // Debug log removed for performance
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });

  // Initialize auto-updater only when an update feed was configured at build time
  if (!isMicrosoftStoreVersion() && isAutoUpdateConfigured()) {
    // Auto-updater enabled for NSIS build

    // Check for updates 30 seconds after launch (gives app time to fully load)
    setTimeout(() => {
      log.info('[Auto-Update] Performing initial update check...');
      autoUpdater.checkForUpdatesAndNotify();
    }, 30000);

    // Check for updates every 6 hours
    setInterval(() => {
      log.info('[Auto-Update] Performing scheduled update check...');
      autoUpdater.checkForUpdatesAndNotify();
    }, 6 * 60 * 60 * 1000);
  } else {
    log.info('[Auto-Update] Disabled (no update feed configured)');
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Global recording functions
const startGlobalRecording = async (sourceInfo) => {
  try {
    if (isGlobalRecording) {
      return { success: false, error: 'Recording already in progress' };
    }

    isGlobalRecording = true;
    recordedClicks = [];
    recordingStartTime = Date.now();

    // Start video recording if source is provided
    if (sourceInfo) {
      await startVideoRecording(sourceInfo);
    }

    // Start monitoring mouse events using the native click capture service
    await startMouseEventMonitoring();

    return { success: true };
  } catch (error) {
    console.error('Error starting global recording');
    return { success: false, error: error.message };
  }
};

const startVideoRecording = async (sourceInfo) => {
  try {
    // Create video recording directory in userData (writable in production)
    const userDataPath = app.getPath('userData');
    const recordingsDir = path.join(userDataPath, 'recordings');
    await ensureDir(recordingsDir);

    // Path logs removed for production security
    
    // Generate unique filename with MP4 extension for Windows
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    recordingFilePath = path.join(recordingsDir, `recording-${timestamp}.mp4`);
    
    // Get the video stream using desktopCapturer
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    const source = sources.find(s => s.id === sourceInfo.id);
    if (!source) {
      throw new Error(`Source ${sourceInfo.id} not found`);
    }
    
    // Send the source info to renderer for stream creation
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('create-video-stream', {
        sourceId: sourceInfo.id,
        sourceName: sourceInfo.name,
        filePath: recordingFilePath
      });
    }
    
    return { success: true, filePath: recordingFilePath };
  } catch (error) {
    console.error('Failed to start video recording');
    
    // Send error message to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('video-recording-error', {
        error: error.message
      });
    }
    
    return { success: false, error: error.message };
  }
};

const stopVideoRecording = async () => {
  try {
    // Send stop message to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('stop-video-recording', {
        filePath: recordingFilePath
      });
    }
    
    return { success: true, filePath: recordingFilePath };
  } catch (error) {
    console.error('Failed to stop video recording');
    
    // Send error message to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('video-recording-error', {
        error: error.message
      });
    }
    
    return { success: false, error: error.message };
  }
};

const stopGlobalRecording = async () => {
  try {
    if (!isGlobalRecording) {
      return { success: false, error: 'No recording in progress' };
    }

    isGlobalRecording = false;

    // Get bookmarks before stopping and cleaning up
    let bookmarks = [];
    if (hotkeyCapture && isHotkeyActive) {
      try {
        bookmarks = hotkeyCapture.getBookmarkEvents();
      } catch (error) {
        console.error('Error retrieving bookmarks');
      }
    }

    // Stop video recording
    const videoResult = await stopVideoRecording();

    // Stop mouse event monitoring
    stopMouseEventMonitoring();

    return {
      success: true,
      clicks: recordedClicks,
      videoFilePath: videoResult.filePath,
      bookmarks: bookmarks
    };
  } catch (error) {
    console.error('Error stopping global recording');
    return { success: false, error: error.message };
  }
};

// Function to add cursor highlighting to screenshot
const addCursorHighlighting = (canvas, ctx, clickX, clickY, sourceWidth, sourceHeight, source) => {
  let relativeX, relativeY;

  // Check if clickX and clickY are already adjusted (relative) coordinates
  // This happens when we crop the image and adjust coordinates in captureDesktopScreenshot
  const isAlreadyAdjusted = source && (
    (source.id.startsWith('window:') && cachedSourceBounds && cachedSourceBounds.type === 'window') ||
    (source.id.startsWith('screen:') && cachedSourceBounds && cachedSourceBounds.type === 'screen')
  );

  if (isAlreadyAdjusted) {
    // Coordinates are already relative to the cropped source, just scale to canvas
    relativeX = clickX;
    relativeY = clickY;
  } else if (source && source.id.startsWith('screen:')) {
    // For screen sources, find the correct display and calculate relative position
    const displays = screen.getAllDisplays();
    const display = displays.find(d => `screen:${d.id}` === source.id);

    if (display) {
      // Calculate relative position within the specific display
      relativeX = ((clickX - display.bounds.x) / display.bounds.width) * sourceWidth;
      relativeY = ((clickY - display.bounds.y) / display.bounds.height) * sourceHeight;
    } else {
      // Fallback to primary display calculation
      const primaryDisplay = screen.getPrimaryDisplay();
      relativeX = (clickX / primaryDisplay.size.width) * sourceWidth;
      relativeY = (clickY / primaryDisplay.size.height) * sourceHeight;
    }
  } else {
    // For window sources or fallback, use primary display calculation
    // This is an approximation since we can't easily get exact window bounds
    const primaryDisplay = screen.getPrimaryDisplay();
    relativeX = (clickX / primaryDisplay.size.width) * sourceWidth;
    relativeY = (clickY / primaryDisplay.size.height) * sourceHeight;
  }

  // Ensure coordinates are within bounds
  relativeX = Math.max(0, Math.min(sourceWidth, relativeX));
  relativeY = Math.max(0, Math.min(sourceHeight, relativeY));


  // Draw cursor highlight
  ctx.save();

  // Draw outer glow
  ctx.shadowColor = '#ff4444';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(relativeX, relativeY, 25, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw inner circle
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
  ctx.beginPath();
  ctx.arc(relativeX, relativeY, 15, 0, 2 * Math.PI);
  ctx.fill();

  // Draw center dot
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(relativeX, relativeY, 3, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
};

const captureDesktopScreenshot = async (clickX, clickY) => {
  try {
    // If a specific source is selected, capture directly from that source
    if (selectedCaptureSource) {

      try {
        // Get all available sources
        const sources = await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 3840, height: 2160 }
        });

        // Find the specific source by ID
        const targetSource = sources.find(source => source.id === selectedCaptureSource.id);

        if (targetSource) {
          const { createCanvas, loadImage } = await import('canvas');
          const img = await loadImage(targetSource.thumbnail.toDataURL());

          // For window sources, the thumbnail already contains ONLY the window
          // For screen sources, the thumbnail already contains ONLY that screen
          // We just need to adjust click coordinates to be relative to the source
          let finalCanvas, finalCtx, adjustedClickX, adjustedClickY;

          if (selectedCaptureSource.id.startsWith('window:') && cachedSourceBounds && cachedSourceBounds.type === 'window') {
            // Window thumbnail is already cropped by Electron, just adjust coordinates
            const bounds = cachedSourceBounds.bounds;
            const windowWidth = bounds.right - bounds.left;
            const windowHeight = bounds.bottom - bounds.top;

            // Create canvas with the window thumbnail (already cropped)
            finalCanvas = createCanvas(img.width, img.height);
            finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(img, 0, 0);

            // Calculate click position relative to window
            // Scale from actual window size to thumbnail size
            const scaleX = img.width / windowWidth;
            const scaleY = img.height / windowHeight;

            adjustedClickX = (clickX - bounds.left) * scaleX;
            adjustedClickY = (clickY - bounds.top) * scaleY;

          } else if (selectedCaptureSource.id.startsWith('screen:') && cachedSourceBounds && cachedSourceBounds.type === 'screen') {
            // Screen thumbnail is already cropped by Electron, just adjust coordinates
            const bounds = cachedSourceBounds.bounds;

            // Create canvas with the screen thumbnail (already cropped)
            finalCanvas = createCanvas(img.width, img.height);
            finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(img, 0, 0);

            // Calculate click position relative to screen
            const scaleX = img.width / bounds.width;
            const scaleY = img.height / bounds.height;

            adjustedClickX = (clickX - bounds.x) * scaleX;
            adjustedClickY = (clickY - bounds.y) * scaleY;

          } else {
            // No adjustment needed
            finalCanvas = createCanvas(img.width, img.height);
            finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(img, 0, 0);
            adjustedClickX = clickX;
            adjustedClickY = clickY;
          }

          // Add cursor highlighting with adjusted coordinates
          addCursorHighlighting(finalCanvas, finalCtx, adjustedClickX, adjustedClickY,
                               finalCanvas.width, finalCanvas.height, selectedCaptureSource);

          const highlightedImageData = finalCanvas.toDataURL();

          // Return screenshot data without saving to avoid duplicates
          // The renderer will handle saving via handleGlobalMouseClick

          return {
            success: true,
            imageData: highlightedImageData,
            clickX: clickX,
            clickY: clickY,
            timestamp: Date.now()
          };
        } else {
          console.warn('Source not found, falling back to screen capture');
        }
      } catch (sourceError) {
        console.warn('Source-specific capture failed, falling back to screen capture');
      }
    }

    // Fall back to primary screen capture
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 }
    });

    if (sources.length > 0) {
      const targetSource = sources[0];

      // Create canvas to add cursor highlighting for fallback
      const { createCanvas, loadImage } = await import('canvas');
      const img = await loadImage(targetSource.thumbnail.toDataURL());
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');

      // Draw the original screenshot
      ctx.drawImage(img, 0, 0);

      // Add cursor highlighting
      addCursorHighlighting(canvas, ctx, clickX, clickY, img.width, img.height, null);

      const highlightedImageData = canvas.toDataURL();

      // Return screenshot data without saving to avoid duplicates
      // The renderer will handle saving via handleGlobalMouseClick

      return {
        success: true,
        imageData: highlightedImageData,
        clickX: clickX,
        clickY: clickY,
        timestamp: Date.now()
      };
    }

    return { success: false, error: 'No screen sources available' };
  } catch (error) {
    console.error('Error capturing desktop screenshot');
    return { success: false, error: error.message };
  }
};

// Real mouse click detection using Electron's native capabilities
let clickDetectionActive = false;
let lastClickTime = 0;
const CLICK_DEBOUNCE_MS = 50; // Prevent duplicate captures
let mouseMonitoringInterval = null;
let realMouseClickListener = null;
let processedClickIds = new Set(); // Track processed clicks to prevent duplicates
let clickIdCounter = 0;

// Cached bounds for performance optimization
let cachedSourceBounds = null;
let cachedSourceId = null;
let boundsRefreshInterval = null;
// Guard prevents interval ticks from piling up if a refresh ever takes longer than the interval.
let boundsRefreshInFlight = false;

// Function to update cached bounds when source changes
const updateCachedSourceBounds = async (source, forceUpdate = false) => {
  if (!source) {
    cachedSourceBounds = null;
    cachedSourceId = null;
    return;
  }

  // Skip if same source and not forcing update (only skip on initial set, not on refresh)
  if (!forceUpdate && cachedSourceId === source.id && cachedSourceBounds) {
    return;
  }

  try {
    // For screen sources, get screen bounds
    if (source.id.startsWith('screen:')) {
      const displays = screen.getAllDisplays();

      // desktopCapturer format: "screen:0:0" or "screen:1:0"
      // Extract display index (first number after "screen:")
      const match = source.id.match(/^screen:(\d+):/);
      let display = null;

      if (match) {
        const displayIndex = parseInt(match[1], 10);
        if (displayIndex >= 0 && displayIndex < displays.length) {
          display = displays[displayIndex];
        }
      }

      if (display) {
        cachedSourceBounds = {
          type: 'screen',
          bounds: display.bounds,
          workArea: display.workArea,
          scaleFactor: display.scaleFactor
        };
        cachedSourceId = source.id;
        return;
      }
    }

    // For window sources, get window bounds
    if (source.id.startsWith('window:')) {
      const windowHandle = source.id.split(':')[1];
      if (windowHandle) {
        const windowBounds = await getWindowBounds(parseInt(windowHandle, 10));
        if (windowBounds) {
          // Get scale factor for the display containing this window
          const midX = (windowBounds.left + windowBounds.right) / 2;
          const midY = (windowBounds.top + windowBounds.bottom) / 2;
          const displays = screen.getAllDisplays();
          // Find display by checking physical pixel midpoint against scaled display bounds
          let windowScaleFactor = 1;
          for (const d of displays) {
            const physLeft = d.bounds.x * d.scaleFactor;
            const physTop = d.bounds.y * d.scaleFactor;
            const physRight = physLeft + d.bounds.width * d.scaleFactor;
            const physBottom = physTop + d.bounds.height * d.scaleFactor;
            if (midX >= physLeft && midX < physRight && midY >= physTop && midY < physBottom) {
              windowScaleFactor = d.scaleFactor;
              break;
            }
          }
          cachedSourceBounds = {
            type: 'window',
            bounds: windowBounds,
            scaleFactor: windowScaleFactor,
            targetHwnd: parseInt(windowHandle, 10),
            foregroundHwnd: windowBounds.foregroundHwnd,
          };
          cachedSourceId = source.id;
          return;
        }
      }
    }

    // Fallback - allow all clicks
    cachedSourceBounds = { type: 'all', bounds: null };
    cachedSourceId = source.id;
  } catch (error) {
    console.error('Error updating cached bounds');
    cachedSourceBounds = { type: 'all', bounds: null };
    cachedSourceId = source.id;
  }
};

// Convert cachedSourceBounds to { x, y, width, height } logical pixels for overlay positioning
function _getOverlayBounds(cached) {
  if (!cached || !cached.bounds) return null;
  if (cached.type === 'screen') {
    // Use workArea (excludes taskbar) for overlay positioning
    return cached.workArea || cached.bounds;
  }
  if (cached.type === 'window') {
    const b = cached.bounds;
    // Window bounds from GetWindowRect are in physical pixels — convert to logical
    const sf = cached.scaleFactor || 1;
    let x = Math.round(b.left / sf);
    let y = Math.round(b.top / sf);
    let w = Math.round((b.right - b.left) / sf);
    let h = Math.round((b.bottom - b.top) / sf);

    // Clamp to display bounds — maximized windows extend ~7px beyond each screen edge
    const display = screen.getDisplayNearestPoint({ x: x + Math.round(w / 2), y: y + Math.round(h / 2) });
    if (display) {
      const db = display.bounds;
      const clampedX = Math.max(x, db.x);
      const clampedY = Math.max(y, db.y);
      const clampedRight = Math.min(x + w, db.x + db.width);
      const clampedBottom = Math.min(y + h, db.y + db.height);
      x = clampedX;
      y = clampedY;
      w = clampedRight - clampedX;
      h = clampedBottom - clampedY;
    }

    return { x, y, width: w, height: h };
  }
  return null;
}

// 🔐 SECURITY: Validate and sanitize hotkey configuration
// This helper prevents script injection, buffer overflows, and malformed data
function validateAndSanitizeHotkeyConfig(config) {
  const defaults = { primary: 'F8', secondary: 'CommandOrControl+Shift+C' };

  if (!config || typeof config !== 'object') {
    console.warn('Invalid hotkey config object, using defaults');
    return defaults;
  }

  // Validate primary hotkey
  let primaryHotkey = defaults.primary;
  if (typeof config.primary === 'string') {
    const trimmed = config.primary.trim();
    // Maximum reasonable length for a hotkey combination (e.g., "CommandOrControl+Shift+Alt+F12")
    if (trimmed.length > 0 && trimmed.length <= 50) {
      // Prevent script injection - only allow safe characters for hotkey combinations
      if (!/[<>'"`;\\{}()\[\]]/.test(trimmed)) {
        primaryHotkey = trimmed;
      } else {
        console.warn('Invalid characters in primary hotkey config, using default');
      }
    } else {
      console.warn('Primary hotkey length invalid, using default');
    }
  }

  // Validate secondary hotkey (optional)
  let secondaryHotkey = defaults.secondary;
  if (typeof config.secondary === 'string') {
    const trimmed = config.secondary.trim();
    if (trimmed.length > 0 && trimmed.length <= 50) {
      if (!/[<>'"`;\\{}()\[\]]/.test(trimmed)) {
        secondaryHotkey = trimmed;
      } else {
        console.warn('Invalid characters in secondary hotkey config, using default');
      }
    } else if (trimmed.length === 0) {
      secondaryHotkey = ''; // Allow empty secondary hotkey
    }
  }

  return {
    primary: primaryHotkey,
    secondary: secondaryHotkey
  };
}

// STORE-COMPLIANT: Setup hotkey-based screen capture
const setupStoreCompliantScreenCapture = async () => {
  try {

    // Cleanup existing instance before creating new one
    if (hotkeyCapture) {
      try {
        if (hotkeyCapture.isRunning()) {
          await hotkeyCapture.stop();
        }
        hotkeyCapture.cleanup();
      } catch (cleanupError) {
        console.error('Error during hotkeyCapture cleanup');
      }
      hotkeyCapture = null;
    }

    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
    await ensureDir(screenshotsDir);

    // Load user's hotkey configuration
    const configPath = path.join(app.getPath('userData'), 'hotkey-config.json');
    let userHotkeys = { primary: 'F8', secondary: 'CommandOrControl+Shift+C' };

    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const rawConfig = JSON.parse(configData);
        // 🔐 SECURITY: Validate and sanitize loaded config
        userHotkeys = validateAndSanitizeHotkeyConfig(rawConfig);
        // Hotkey config loaded successfully
      } catch (error) {
        console.warn('Failed to load hotkey config, using defaults');
      }
    }

    // Create hotkey capture service instance
    hotkeyCapture = new HotkeyScreenCaptureService(mainWindow, {
      outputDir: screenshotsDir,
      primaryHotkey: userHotkeys.primary,
      secondaryHotkey: userHotkeys.secondary,
      radius: 30,
      onCaptureCountChanged: (count) => captureOverlay.updateCount(count),
      onBeforeCapture: () => captureOverlay.temporaryHide(),
      onAfterCapture: () => captureOverlay.temporaryShow(),
    });

    // Initialize bookmark system for timeline markers
    hotkeyCapture.setRecordingStartTime(Date.now());
    hotkeyCapture.clearBookmarkEvents();

    // Start the service
    const started = await hotkeyCapture.start();
    if (started) {
      isHotkeyActive = true;
    } else {
      throw new Error('Failed to start hotkey capture service');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Store-compliant screen capture');
    throw error;
  }
};

// Send hotkey instructions to renderer
const sendHotkeyInstructions = () => {
  if (!mainWindow) return;

  const configPath = path.join(app.getPath('userData'), 'hotkey-config.json');
  let userHotkeys = { primary: 'F8', secondary: 'CommandOrControl+Shift+C' };

  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const rawConfig = JSON.parse(configData);
      // 🔐 SECURITY: Validate and sanitize loaded config
      userHotkeys = validateAndSanitizeHotkeyConfig(rawConfig);
    } catch (error) {
      console.warn('Failed to load hotkey config for instructions');
    }
  }

  mainWindow.webContents.send('capture-instructions', {
    message: 'Press hotkey to capture screenshots',
    mode: 'hotkey',
    primary_hotkey: userHotkeys.primary,
    secondary_hotkey: userHotkeys.secondary,
    note: 'Store-compliant capture using Electron globalShortcut API'
  });
};

const startMouseEventMonitoring = async () => {
  clickDetectionActive = true;

  // STORE-COMPLIANT: Use hotkey-based capture instead of mouse hooks
  await setupStoreCompliantScreenCapture();

  // Send instructions to renderer about hotkey usage
  sendHotkeyInstructions();

  // REMOVED: setupGlobalMouseClickDetection() - Microsoft Store compliance
  // App now uses ONLY hotkeys for screenshot capture

  // Show capture overlay on top of the source (skip during video recording — it would appear in the video)
  if (cachedSourceBounds && !isGlobalRecording) {
    const overlayBounds = _getOverlayBounds(cachedSourceBounds);
    if (overlayBounds) {
      captureOverlay.show(overlayBounds, cachedSourceBounds.type);
    }
  }

  // Set up periodic bounds refresh (200ms) to handle window movement + overlay position
  if (boundsRefreshInterval) {
    clearInterval(boundsRefreshInterval);
  }
  boundsRefreshInterval = setInterval(async () => {
    if (!clickDetectionActive) return;
    if (boundsRefreshInFlight) return;
    boundsRefreshInFlight = true;
    try {
      if (selectedCaptureSource && clickDetectionActive) {
        await updateCachedSourceBounds(selectedCaptureSource, true);

        // Update the hotkey service with the new bounds
        if (hotkeyCapture && cachedSourceBounds) {
          hotkeyCapture.setSelectedSource(selectedCaptureSource, cachedSourceBounds);
        }
        // Update overlay position + visibility based on foreground state
        if (cachedSourceBounds) {
          const overlayPos = _getOverlayBounds(cachedSourceBounds);
          if (cachedSourceBounds.type === 'window' && cachedSourceBounds.targetHwnd && cachedSourceBounds.foregroundHwnd) {
            // Get our own window handle to exclude from hide logic
            const docfaiHwnd = mainWindow ? mainWindow.getNativeWindowHandle().readInt32LE(0) : null;
            const fg = cachedSourceBounds.foregroundHwnd;
            const isTargetOrDocfai = fg === cachedSourceBounds.targetHwnd || fg === docfaiHwnd;
            if (!isTargetOrDocfai) {
              captureOverlay.temporaryHide();
            } else {
              captureOverlay.temporaryShow();
              if (overlayPos) captureOverlay.updatePosition(overlayPos);
            }
          } else {
            if (overlayPos) captureOverlay.updatePosition(overlayPos);
          }
        }
      }
    } finally {
      boundsRefreshInFlight = false;
    }
  }, 200);
};

// ===================================================================
// LEGACY CODE REMOVED - NOT MICROSOFT STORE COMPLIANT
// ===================================================================
// The following code used Windows Native Mouse Hook (SetWindowsHookEx)
// which is PROHIBITED by Microsoft Store policies.
//
// Replaced with: HotkeyScreenCaptureService (using globalShortcut API)
// See: setupStoreCompliantScreenCapture() function
// ===================================================================

// Get window bounds via user32.dll FFI (microseconds, in-process).
// Replaces the earlier powershell.exe + Add-Type spawn which caused the
// process-storm / freeze on corporate Citrix machines.
const getWindowBounds = async (windowHandle) => {
  try {
    if (!getWindowRectFFI) return null;

    const hwnd = typeof windowHandle === 'number' ? windowHandle : parseInt(windowHandle, 10);
    if (!Number.isFinite(hwnd) || hwnd <= 0) return null;

    const rect = {};
    const ok = getWindowRectFFI(hwnd, rect);
    if (!ok) return null;

    let foregroundHwnd = null;
    if (getForegroundWindowFFI) {
      const fg = getForegroundWindowFFI();
      foregroundHwnd = typeof fg === 'bigint' ? Number(fg) : fg;
    }

    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      foregroundHwnd,
    };
  } catch (error) {
    return null;
  }
};

// Function to crop PNG buffer to source bounds
const cropPngToSourceBounds = async (pngBuffer, source) => {
  try {
    if (!source || !cachedSourceBounds || cachedSourceBounds.type === 'all') {
      return pngBuffer; // Return original if no cropping needed
    }

    const { createCanvas, loadImage } = await import('canvas');
    
    // Load the full-screen PNG into a canvas
    const img = await loadImage(pngBuffer);
    
    let cropBounds;
    if (cachedSourceBounds.type === 'screen') {
      const bounds = cachedSourceBounds.bounds;
      cropBounds = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };
    } else if (cachedSourceBounds.type === 'window') {
      const bounds = cachedSourceBounds.bounds;
      cropBounds = {
        x: bounds.left,
        y: bounds.top,
        width: bounds.right - bounds.left,
        height: bounds.bottom - bounds.top
      };
    } else {
      return pngBuffer; // No valid bounds for cropping
    }

    // Ensure crop bounds are within image dimensions
    cropBounds.x = Math.max(0, Math.min(cropBounds.x, img.width));
    cropBounds.y = Math.max(0, Math.min(cropBounds.y, img.height));
    cropBounds.width = Math.min(cropBounds.width, img.width - cropBounds.x);
    cropBounds.height = Math.min(cropBounds.height, img.height - cropBounds.y);

    // Create a new canvas with the crop dimensions
    const canvas = createCanvas(cropBounds.width, cropBounds.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the cropped portion of the original image
    ctx.drawImage(
      img,
      cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height, // Source rectangle
      0, 0, cropBounds.width, cropBounds.height // Destination rectangle
    );
    
    // Convert back to PNG buffer
    const croppedBuffer = canvas.toBuffer('image/png');
    
    return croppedBuffer;
  } catch (error) {
    console.error('Error cropping PNG');
    return pngBuffer; // Return original on error
  }
};

// Fast function to check if a click is within the bounds of the selected source using cached data
const isClickWithinSourceBounds = (clickX, clickY, source) => {
  try {
    if (!source) return true; // If no source selected, allow all clicks

    // Use cached bounds for ultra-fast validation
    if (!cachedSourceBounds || cachedSourceId !== source.id) {
      return true;
    }

    // Handle different source types using cached data
    if (cachedSourceBounds.type === 'all') {
      return true; // Allow all clicks
    }

    if (cachedSourceBounds.type === 'screen') {
      const bounds = cachedSourceBounds.bounds;
      const withinBounds = clickX >= bounds.x &&
                         clickX <= bounds.x + bounds.width &&
                         clickY >= bounds.y &&
                         clickY <= bounds.y + bounds.height;
      return withinBounds;
    }

    if (cachedSourceBounds.type === 'window') {
      const bounds = cachedSourceBounds.bounds;
      const withinBounds = clickX >= bounds.left &&
                         clickX <= bounds.right &&
                         clickY >= bounds.top &&
                         clickY <= bounds.bottom;

      // Additional check: Verify this is actually the target window, not DocFai on top
      if (withinBounds && source.id.startsWith('window:')) {
        const targetHandle = parseInt(source.id.split(':')[1], 10);

        // Quick check: Is the main window focused? If so, reject this click
        if (mainWindow && mainWindow.isFocused()) {
          return false;
        }
      }

      return withinBounds;
    }

    return true; // Default to allowing clicks
  } catch (error) {
    console.error('Error in fast bounds check');
    return true; // Default to allowing clicks on error
  }
};

// ===================================================================
// REMOVED: setupRealMouseClickDetection() - NOT STORE COMPLIANT
// ===================================================================
// This function used SetWindowsHookEx which is prohibited by MS Store.
// Now using HotkeyScreenCaptureService with Electron's globalShortcut.
// ===================================================================

const stopMouseEventMonitoring = () => {
  clickDetectionActive = false;

  // STORE-COMPLIANT: Stop hotkey capture service
  if (hotkeyCapture && isHotkeyActive) {
    try {
      hotkeyCapture.stop();
      hotkeyCapture.cleanup();
    } catch (error) {
      console.error('Error stopping hotkey capture');
    }
    hotkeyCapture = null;
    isHotkeyActive = false;
  }

  // Clean up IPC listeners
  ipcMain.removeAllListeners('manual-screenshot-trigger');

  // Stop mouse monitoring interval (if any)
  if (mouseMonitoringInterval) {
    clearInterval(mouseMonitoringInterval);
    mouseMonitoringInterval = null;
    // Debug log removed for performance
  }

  // Hide capture overlay
  captureOverlay.hide();

  // Stop bounds refresh interval - CRITICAL FIX: This prevents yellow margin from persisting
  if (boundsRefreshInterval) {
    clearInterval(boundsRefreshInterval);
    boundsRefreshInterval = null;
  }

  // MEMORY LEAK FIX: Clear cached source bounds and selected source to free memory
  cachedSourceBounds = null;
  selectedCaptureSource = null;

  // Clean up real mouse click listener
  if (realMouseClickListener && mainWindow) {
    mainWindow.removeListener('focus', realMouseClickListener);
    realMouseClickListener = null;
  }

  // REMOVED: stopGlobalMouseClickDetection() - Microsoft Store compliance

  // Debug log removed for performance
};

// IPC handlers for global recording
ipcMain.handle('start-global-recording', async (event, sourceInfo) => {
  try {
    // Store the selected source for capture
    if (sourceInfo) {
      selectedCaptureSource = sourceInfo;
      // Debug log removed for performance
      // Update cached bounds for fast click validation
      await updateCachedSourceBounds(sourceInfo);

      // IMPORTANT: Wait for bounds to be cached, then pass to hotkey service

      // NOTE: Source will be set after service initialization in startGlobalRecording
    } else {
      selectedCaptureSource = null;
      // Debug log removed for performance
      // Clear cached bounds
      await updateCachedSourceBounds(null);
    }

    const result = await startGlobalRecording(sourceInfo);

    // Set source AFTER the service is initialized
    if (sourceInfo && hotkeyCapture) {
      hotkeyCapture.setSelectedSource(sourceInfo, cachedSourceBounds);
    } else if (!sourceInfo && hotkeyCapture) {
      hotkeyCapture.setSelectedSource(null, null);
    }

    return result;
  } catch (error) {
    console.error('Error starting global recording');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-global-recording', async () => {
  try {
    const result = await stopGlobalRecording();
    // Ensure only serializable data is returned
    const serializableResult = {
      success: result.success,
      error: result.error,
      clicks: result.clicks ? result.clicks.map(click => ({
        timestamp: click.timestamp,
        imageData: click.imageData,
        clickX: click.clickX,
        clickY: click.clickY
      })) : [],
      bookmarks: result.bookmarks || []
    };
    return serializableResult;
  } catch (error) {
    console.error('Error stopping global recording');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('capture-desktop-screenshot', async (event, clickX, clickY) => {
  try {
    // Debug log removed for performance
    const result = await captureDesktopScreenshot(clickX, clickY);
    // Ensure only serializable data is returned
    const serializableResult = {
      success: result.success,
      error: result.error,
      imageData: result.imageData,
      clickX: result.clickX,
      clickY: result.clickY,
      timestamp: result.timestamp
    };
    return serializableResult;
  } catch (error) {
    console.error('Error capturing desktop screenshot');
    return { success: false, error: error.message };
  }
});

// Removed problematic capture-source-screenshot handler
// All source-specific capture is now handled in captureDesktopScreenshot function

ipcMain.handle('get-global-recording-status', () => {
  return {
    isRecording: isGlobalRecording,
    clickCount: recordedClicks.length,
    startTime: recordingStartTime
  };
});

// Removed source-capture-result handler as capture is now done entirely in main process

// IPC handlers for screenshot-only capture mode
ipcMain.handle('start-screenshot-capture', async (event, sourceInfo) => {
  try {
    // Store the selected source for capture
    if (sourceInfo) {
      selectedCaptureSource = sourceInfo;
      // Debug log removed for performance
      // Update cached bounds for fast click validation
      await updateCachedSourceBounds(sourceInfo);

      // IMPORTANT: Wait for bounds to be cached, then pass to hotkey service

      // Send to renderer for debugging
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('debug-log', {
          stage: 'bounds-set-in-electron',
          sourceName: sourceInfo.name,
          cachedSourceBounds: cachedSourceBounds
        });
      }

      // NOTE: Don't set source here - service will be recreated in startMouseEventMonitoring
    } else {
      selectedCaptureSource = null;
      // Debug log removed for performance
      // Clear cached bounds
      await updateCachedSourceBounds(null);
    }

    // Start mouse event monitoring for screenshot capture
    // This will create the hotkey service and we'll set the source after
    await startMouseEventMonitoring();

    // NOW set the source after the service is created
    if (sourceInfo && hotkeyCapture) {
      hotkeyCapture.setSelectedSource(sourceInfo, cachedSourceBounds);
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('debug-log', {
          stage: 'source-set-after-init',
          sourceName: sourceInfo.name,
          hasCachedBounds: !!cachedSourceBounds
        });
      }
    } else if (!sourceInfo && hotkeyCapture) {
      hotkeyCapture.setSelectedSource(null, null);
    }

    return { success: true };
  } catch (error) {
    console.error('Error starting screenshot capture');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-screenshot-capture', async () => {
  try {
    // Stop mouse event monitoring
    stopMouseEventMonitoring();
    
    // Debug log removed for performance
    return { success: true };
  } catch (error) {
    console.error('Error stopping screenshot capture');
    return { success: false, error: error.message };
  }
});

// ===================================================================
// AUTO-CAPTURE MODE: IPC handlers for automatic click-based capture
// Uses GetAsyncKeyState polling + IUIAutomation (Store-compliant)
// ===================================================================

ipcMain.handle('start-auto-capture', async (event, config = {}) => {
  try {
    // WH_MOUSE_LL is prohibited in Microsoft Store (appx) builds
    if (isMicrosoftStoreVersion()) {
      return {
        success: false,
        error: 'Auto-capture is not available in the Microsoft Store version. Use hotkey capture instead.',
      };
    }

    // Store the source info passed from renderer
    const sourceInfo = config.sourceInfo || null;
    if (sourceInfo) {
      selectedCaptureSource = sourceInfo;
      await updateCachedSourceBounds(sourceInfo);
    }

    // Stop any existing hotkey capture (clean slate)
    if (hotkeyCapture && isHotkeyActive) {
      try {
        hotkeyCapture.stop();
        hotkeyCapture.cleanup();
      } catch (_) {}
      hotkeyCapture = null;
      isHotkeyActive = false;
    }

    // Create hotkeyCapture for screenshot delegation (without registering hotkeys)
    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
    await ensureDir(screenshotsDir);

    hotkeyCapture = new HotkeyScreenCaptureService(mainWindow, {
      outputDir: screenshotsDir,
      primaryHotkey: 'F8',
      radius: 30,
      onBeforeCapture: () => captureOverlay.temporaryHide(),
      onAfterCapture: () => captureOverlay.temporaryShow(),
    });

    // Set the source on hotkeyCapture for correct window/screen capture
    if (selectedCaptureSource) {
      hotkeyCapture.setSelectedSource(selectedCaptureSource, cachedSourceBounds);
    }

    // Create auto-capture service
    if (autoCaptureService) {
      await autoCaptureService.stop();
    }

    // Use the renderer's step count as the baseline (survives source switches)
    autoCaptureCountOffset = config.initialStepCount || 0;

    autoCaptureService = new AutoCaptureService(mainWindow, hotkeyCapture, {
      debounceMs: config.debounceMs || 300,
      captureRightClicks: config.captureRightClicks || false,
      showNotifications: config.showNotifications || false,
      onCaptureCountChanged: (count) => captureOverlay.updateCount(autoCaptureCountOffset + count),
    });

    // Extract HWND from source for C++ click filtering, or monitor bounds for screen sources
    let targetWindowHandle = null;
    let screenBounds = null;
    if (selectedCaptureSource && selectedCaptureSource.id && selectedCaptureSource.id.startsWith('window:')) {
      const hwndStr = selectedCaptureSource.id.split(':')[1];
      if (hwndStr) {
        targetWindowHandle = parseInt(hwndStr, 10);
      }
    } else if (cachedSourceBounds && cachedSourceBounds.type === 'screen') {
      screenBounds = cachedSourceBounds.bounds;
    }

    const started = await autoCaptureService.start(targetWindowHandle, screenBounds);

    if (!started) {
      throw new Error('Failed to start auto-capture service');
    }

    // Show capture overlay on top of the source
    if (cachedSourceBounds) {
      const overlayBounds = _getOverlayBounds(cachedSourceBounds);
      if (overlayBounds) {
        captureOverlay.show(overlayBounds, cachedSourceBounds.type);
        // Sync badge to cumulative count (avoids "Step 0" flash on source switch)
        if (autoCaptureCountOffset > 0) {
          captureOverlay.updateCount(autoCaptureCountOffset);
        }
      }
    }

    // Start periodic bounds refresh for the source (200ms for overlay, also updates capture bounds)
    if (boundsRefreshInterval) {
      clearInterval(boundsRefreshInterval);
    }
    boundsRefreshInterval = setInterval(async () => {
      if (boundsRefreshInFlight) return;
      boundsRefreshInFlight = true;
      try {
        if (selectedCaptureSource && autoCaptureService?.isRunning()) {
          await updateCachedSourceBounds(selectedCaptureSource, true);
          if (hotkeyCapture && cachedSourceBounds) {
            hotkeyCapture.setSelectedSource(selectedCaptureSource, cachedSourceBounds);
          }
          // Update overlay position + visibility based on foreground state
          if (cachedSourceBounds) {
            const overlayPos = _getOverlayBounds(cachedSourceBounds);
            if (cachedSourceBounds.type === 'window' && cachedSourceBounds.targetHwnd && cachedSourceBounds.foregroundHwnd) {
              const docfaiHwnd = mainWindow ? mainWindow.getNativeWindowHandle().readInt32LE(0) : null;
              const fg = cachedSourceBounds.foregroundHwnd;
              const isTargetOrDocfai = fg === cachedSourceBounds.targetHwnd || fg === docfaiHwnd;
              if (!isTargetOrDocfai) {
                captureOverlay.temporaryHide();
              } else {
                captureOverlay.temporaryShow();
                if (overlayPos) captureOverlay.updatePosition(overlayPos);
              }
            } else {
              if (overlayPos) captureOverlay.updatePosition(overlayPos);
            }
          }
        }
      } finally {
        boundsRefreshInFlight = false;
      }
    }, 200);

    return { success: true };
  } catch (error) {
    console.error('Error starting auto-capture');
    captureOverlay.hide();
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-auto-capture', async () => {
  try {
    let result = { captureCount: 0, events: [] };

    if (autoCaptureService) {
      result = await autoCaptureService.stop();
      autoCaptureService = null;
    }

    // Clean up hotkeyCapture service (used for screenshot delegation)
    if (hotkeyCapture) {
      try {
        hotkeyCapture.cleanup();
      } catch (_) {}
      hotkeyCapture = null;
    }

    // Clear bounds refresh interval
    if (boundsRefreshInterval) {
      clearInterval(boundsRefreshInterval);
      boundsRefreshInterval = null;
    }

    // Hide capture overlay
    captureOverlay.hide();

    // Clear source state
    cachedSourceBounds = null;
    selectedCaptureSource = null;

    return { success: true, captureCount: result.captureCount };
  } catch (error) {
    console.error('Error stopping auto-capture');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-auto-capture-status', async () => {
  return {
    active: autoCaptureService?.isRunning() || false,
    captureCount: autoCaptureService?.getCaptureCount() || 0,
  };
});

// STORE-COMPLIANT: IPC handlers for hotkey configuration
ipcMain.handle('get-hotkey-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'hotkey-config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const rawConfig = JSON.parse(configData);
      // 🔐 SECURITY: Validate and sanitize loaded config
      const config = validateAndSanitizeHotkeyConfig(rawConfig);
      return { success: true, config };
    }
    // Return defaults
    return {
      success: true,
      config: { primary: 'F8', secondary: 'CommandOrControl+Shift+C' }
    };
  } catch (error) {
    console.error('Error loading hotkey config');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-hotkey-config', async (event, config) => {
  try {
    // 🔐 SECURITY: Validate and sanitize hotkey configuration before saving
    const sanitizedConfig = validateAndSanitizeHotkeyConfig(config);

    // Save validated hotkey config

    const configPath = path.join(app.getPath('userData'), 'hotkey-config.json');
    fs.writeFileSync(configPath, JSON.stringify(sanitizedConfig, null, 2), 'utf8');

    // Update active hotkey service if it's running
    if (hotkeyCapture && isHotkeyActive) {
      await hotkeyCapture.updateHotkeys(sanitizedConfig.primary, sanitizedConfig.secondary);
    }

    return { success: true, config: sanitizedConfig };
  } catch (error) {
    console.error('Error saving hotkey config');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-hotkeys', async (event, primary, secondary) => {
  try {
    if (hotkeyCapture && isHotkeyActive) {
      await hotkeyCapture.updateHotkeys(primary, secondary);
      return { success: true };
    }
    return { success: false, error: 'Hotkey service not active' };
  } catch (error) {
    console.error('Error updating hotkeys');
    return { success: false, error: error.message };
  }
});

// IPC handlers for screen recording functionality
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 }
    });

    // Get all displays to add proper names to screens
    const displays = screen.getAllDisplays();

    // Filter out sources that might not be capturable and enhance screen names
    const capturableSources = sources.filter(source => {
      // Filter out system processes and protected windows
      const name = source.name.toLowerCase();
      const excludePatterns = [
        'dwm.exe',
        'winlogon.exe',
        'csrss.exe',
        'system',
        'registry',
        'secure desktop',
        'windows security'
      ];

      // Check if source name contains any excluded patterns
      const isExcluded = excludePatterns.some(pattern => name.includes(pattern));

      // Also filter out sources with empty or very short names
      const hasValidName = source.name && source.name.trim().length > 0;

      return !isExcluded && hasValidName;
    }).map((source, index) => {
      // Convert thumbnail to data URL in main process (NativeImage doesn't serialize well over IPC)
      const thumbnailDataUrl = source.thumbnail ? source.thumbnail.toDataURL() : null;

      // Enhance screen sources with display numbers
      if (source.id.startsWith('screen:')) {
        const display = displays.find(d => `screen:${d.id}` === source.id);
        if (display) {
          const displayIndex = displays.findIndex(d => d.id === display.id);
          return {
            id: source.id,
            name: `Screen ${displayIndex + 1}`,
            thumbnail: thumbnailDataUrl,
            displayBounds: display.bounds,
            scaleFactor: display.scaleFactor
          };
        }
      }
      return {
        id: source.id,
        name: source.name,
        thumbnail: thumbnailDataUrl
      };
    });

    return capturableSources;
  } catch (error) {
    console.error('Error getting sources');
    // Return at least screen sources if window enumeration fails
    try {
      const screenSources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 }
      });
      return screenSources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null
      }));
    } catch (fallbackError) {
      console.error('Fallback screen sources also failed');
      return [];
    }
  }
});

// Get sources with larger thumbnails for retake picker
ipcMain.handle('get-retake-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 400, height: 300 },
      fetchWindowIcons: true
    });

    const displays = screen.getAllDisplays();

    // Minimal filtering — only exclude truly uncapturable system processes
    const filtered = sources.filter(source => {
      const name = source.name.toLowerCase();
      const systemExclude = ['dwm.exe', 'winlogon.exe', 'csrss.exe', 'secure desktop', 'windows security'];
      return !systemExclude.some(p => name.includes(p)) && source.name.trim().length > 0;
    }).map(source => {
      let name = source.name;
      if (source.id.startsWith('screen:')) {
        const display = displays.find(d => `screen:${d.id}` === source.id);
        if (display) {
          const displayIndex = displays.findIndex(d => d.id === display.id);
          name = `Screen ${displayIndex + 1}`;
        }
      }
      return {
        id: source.id,
        name,
        thumbnail: source.thumbnail.toDataURL()
      };
    });

    return { success: true, sources: filtered };
  } catch (error) {
    console.error('Error getting retake sources');
    return { success: false, sources: [], error: error.message };
  }
});

// Capture a specific source at full resolution (for retake/replace screenshot)
ipcMain.handle('capture-source-screenshot', async (event, sourceId) => {
  try {
    // Get the primary display dimensions for full-resolution capture
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) }
    });

    const source = sources.find(s => s.id === sourceId);
    if (!source) {
      return { success: false, error: 'Source not found — window may have been closed' };
    }

    const jpegBuffer = source.thumbnail.toJPEG(90);
    const base64 = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

    return { success: true, imageData: base64 };
  } catch (error) {
    console.error('Error capturing source screenshot');
    return { success: false, error: error.message || 'Failed to capture screenshot' };
  }
});

// REMOVED: Global mouse click detection (Microsoft Store compliance)
// The setupGlobalMouseClickDetection() and stopGlobalMouseClickDetection() functions
// have been removed because global mouse hooks violate Microsoft Store policies.
// The app now uses ONLY hotkeys (Ctrl+Shift+S) for screenshot capture.

// Listen for video recording events from renderer
ipcMain.on('video-recording-started', (event, data) => {
});

ipcMain.on('video-recording-stopped', (event, data) => {
});

ipcMain.on('video-recording-error', (event, error) => {
  console.error('Video recording error');
});

// IPC handler to create media stream directly in main process
ipcMain.handle('create-media-stream', async (event, sourceId) => {
  try {
    // Get available sources
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    // Find the requested source
    const source = sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }
    
    // Create modern constraints for the specific source
    const constraints = {
      audio: false,
      video: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      }
    };
    
    // Send the source and constraints to renderer for stream creation
    mainWindow.webContents.send('create-video-stream', { 
      constraints, 
      sourceId,
      source: {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }
    });
    
    return { success: true, sourceId };
  } catch (error) {
    console.error('Error creating media stream');
    mainWindow.webContents.send('video-recording-error', { error: error.message });
    throw error;
  }
});

// IPC handler to save video data from renderer
ipcMain.handle('save-video-recording', async (event, videoBlob, fileName) => {
  try {
    // Create recordings directory in userData (writable in production)
    const userDataPath = app.getPath('userData');
    const recordingsDir = path.join(userDataPath, 'recordings');
    await ensureDir(recordingsDir);

    const filePath = fileName || recordingFilePath;

    // Convert blob data to buffer and save
    const buffer = Buffer.from(videoBlob);
    await writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save video recording');
    return { success: false, error: error.message };
  }
});

// Save project video recording handler
ipcMain.handle('save-project-video-recording', async (event, projectName, videoBlob, fileName) => {
  try {
    const recordingsDir = getProjectRecordingsDir(projectName);
    await ensureDir(recordingsDir);
    
    // Generate filename with timestamp if not provided
    const timestamp = Date.now();
    const filename = fileName || `${projectName}_${timestamp}.webm`;
    const filePath = path.join(recordingsDir, filename);
    
    // Convert blob data to buffer and save
    const buffer = Buffer.from(videoBlob);
    await writeFile(filePath, buffer);
    
    return { success: true, filePath, filename };
  } catch (error) {
    console.error('Failed to save project video recording');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-screen-info', () => {
  const displays = screen.getAllDisplays();
  return displays.map(display => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: display.primary
  }));
});

// File system operations
ipcMain.handle('save-recording', async (event, data) => {
  try {
    // Create recordings directory in userData (writable in production)
    const userDataPath = app.getPath('userData');
    const recordingsDir = path.join(userDataPath, 'recordings');
    await ensureDir(recordingsDir);

    // Generate filename with timestamp if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = data.filename || `recording-${timestamp}.webm`;
    const filePath = path.join(recordingsDir, filename);
    
    // Save the video data
    if (data.data) {
      // If data is provided as Uint8Array or Buffer
      await writeFile(filePath, Buffer.from(data.data));
      
      // Verify file was written
      const stats = await stat(filePath);
    } else {
      // Create empty file if no data (placeholder)
      await writeFile(filePath, Buffer.alloc(0));
    }

    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save recording');
    return { success: false, error: error.message };
  }
});

// New handler for generating file content without save dialog
ipcMain.handle('generate-file-content', async (event, data) => {
  try {
    const { format, content, options } = data;
    
    // Create a temporary file path for generation
    const tempDir = path.join(os.tmpdir(), 'docfai-temp');
    await fs.promises.mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `temp-export-${Date.now()}.${format}`);
    
    // Generate file based on format
    if (format === 'pdf') {
      await generatePDF(content, tempFilePath, options);
    } else if (format === 'html') {
      await generateHTML(content, tempFilePath, options);
    } else if (format === 'pptx') {
      await generatePPTX(content, tempFilePath, options);
    } else if (format === 'markdown') {
      await generateMarkdown(content, tempFilePath, options);
    } else {
      // For other formats, create a placeholder file
      await writeFile(tempFilePath, `Documentation exported as ${format}\nContent: ${JSON.stringify(content, null, 2)}`);
    }

    // Read the generated file and return as base64
    const fileBuffer = await readFile(tempFilePath);
    const fileData = fileBuffer.toString('base64');
    
    // Clean up temporary file
    try {
      await fs.promises.unlink(tempFilePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temporary file');
    }

    return { success: true, fileData, size: fileBuffer.length };
  } catch (error) {
    console.error('Error in generate-file-content');
    return { success: false, error: error.message };
  }
});

// Preview handler - generates HTML and opens in browser without save dialog
ipcMain.handle('preview-documentation', async (event, data) => {
  try {
    const { content, options } = data;

    // Generate HTML content
    const htmlContent = generateHTMLContent(content, options);

    // Create temporary file
    const tempDir = os.tmpdir();
    const previewFileName = `docfai-preview-${Date.now()}.html`;
    const previewFilePath = path.join(tempDir, previewFileName);

    // Write HTML to temp file
    await writeFile(previewFilePath, htmlContent);

    // Open in default browser
    await shell.openExternal(`file://${previewFilePath}`);

    return { success: true, filePath: previewFilePath };
  } catch (error) {
    console.error('[Preview] Error generating preview');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-file', async (event, data) => {
  try {
    const { format, content, outputPath, options } = data;

    // Define file filters based on the export format
    const formatFilters = {
      'pdf': [
        { name: 'PDF Document', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      'html': [
        { name: 'HTML File', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      'pptx': [
        { name: 'PowerPoint Presentation', extensions: ['pptx'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      'markdown': [
        { name: 'Markdown Document', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      'video': [
        { name: 'Video File', extensions: ['mp4', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    };

    // Get filters for the current format, or use default
    const filters = formatFilters[format] || [
      { name: 'All Files', extensions: ['*'] }
    ];

    // Show save dialog with format-specific filters
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Export Documentation as ${format.toUpperCase()}`,
      defaultPath: outputPath,
      filters
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePath;

    // Generate file based on format
    if (format === 'pdf') {
      await generatePDF(content, filePath, options);
    } else if (format === 'html') {
      await generateHTML(content, filePath, options);
    } else if (format === 'pptx') {
      await generatePPTX(content, filePath, options);
    } else if (format === 'markdown') {
      await generateMarkdown(content, filePath, options);
    } else {
      // For other formats, create a placeholder file
      await writeFile(filePath, `Documentation exported as ${format}\nContent: ${JSON.stringify(content, null, 2)}`);
    }

    // Read the generated file to return as fileData for background saving
    let fileData = null;
    try {
      const fileBuffer = await readFile(filePath);
      fileData = fileBuffer.toString('base64');
    } catch (readError) {
      console.error('Error reading generated file for fileData');
    }

    return { success: true, path: filePath, fileData };
  } catch (error) {
    console.error('Error in export-file');
    return { success: false, error: error.message };
  }
});

// European date/time formatting for export documents (DD/MM/YYYY HH:mm)
// Accepts a Date object or a numeric timestamp (seconds or milliseconds)
function formatEuropeanDateTime(input) {
  let date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    // Timestamps below 1e12 are in seconds; convert to milliseconds
    date = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    date = new Date(input);
  }
  // Guard against invalid dates
  if (isNaN(date.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Compress a base64 data URL image for PDF embedding
// Resizes to max 1200px wide and re-encodes as JPEG at 75% quality
function compressImageDataUrl(dataUrl, maxWidth = 1200, quality = 75) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return dataUrl;

    // Extract the raw base64 data (strip the data:image/...;base64, prefix)
    const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match) return dataUrl;

    const img = nativeImage.createFromBuffer(Buffer.from(base64Match[1], 'base64'));
    if (img.isEmpty()) return dataUrl;

    const size = img.getSize();
    let resized = img;

    // Downscale if wider than maxWidth (preserve aspect ratio)
    if (size.width > maxWidth) {
      const scale = maxWidth / size.width;
      resized = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        quality: 'good'
      });
    }

    // Re-encode as JPEG with reduced quality
    const jpegBuffer = resized.toJPEG(quality);
    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
  } catch (error) {
    console.warn('Image compression failed, using original');
    return dataUrl;
  }
}

// PDF Generation Function using Electron's built-in PDF generation
async function generatePDF(content, filePath, options) {
  // Create a hidden BrowserWindow for PDF generation
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged // Explicitly disable DevTools in packaged production builds
    }
  });

  try {
    // Compress screenshot images before embedding in PDF to reduce file size
    if (content.screenshots && content.screenshots.length > 0) {
      const originalSize = JSON.stringify(content.screenshots).length;
      content.screenshots = content.screenshots.map((s) => {
        if (s.imageData) {
          return { ...s, imageData: compressImageDataUrl(s.imageData) };
        }
        return s;
      });
      const compressedSize = JSON.stringify(content.screenshots).length;
    }

    // Generate HTML content for PDF
    const htmlContent = generateHTMLContent(content, options);

    // Create a temporary HTML file to avoid data URL length limitations
    const tempDir = os.tmpdir();
    const tempHtmlPath = path.join(tempDir, `pdf-temp-${Date.now()}.html`);
    await writeFile(tempHtmlPath, htmlContent);

    // Load HTML file into the window
    await pdfWindow.loadFile(tempHtmlPath);

    // Wait for content to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate PDF using Electron's built-in PDF generation
    // Note: Electron uses different margin units than Puppeteer
    // Margins are specified in inches (not mm or microns)
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {
        top: 0.4,    // ~10mm top margin for breathing room on every page
        right: 0,
        bottom: 0.35, // ~9mm bottom margin
        left: 0
      }
    });

    // Save PDF to file
    await writeFile(filePath, pdfBuffer);

    // Clean up temporary HTML file
    try {
      await remove(tempHtmlPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp HTML file');
    }
  } catch (error) {
    console.error('Error generating PDF');
    throw error;
  } finally {
    pdfWindow.close();
  }
}

// HTML Generation Function
async function generateHTML(content, filePath, options) {
  const htmlContent = generateHTMLContent(content, options);
  await writeFile(filePath, htmlContent);
}

// Helper function to parse HTML content for PowerPoint with formatting
function parseHTMLForPPTX(html) {
  if (!html) return '';

  // Check if content contains HTML tags
  const hasHtmlTags = /<[^>]+>/.test(html);

  if (!hasHtmlTags) {
    // Plain text - return as-is
    return html;
  }

  // Parse HTML and extract formatted text for PowerPoint
  // PptxGenJS supports text formatting through an array of text objects
  try {
    // Simple HTML parser - extract text with formatting
    // For PowerPoint, we need to return an array of text objects with formatting options
    // However, slide.addText() can accept either a string or an array of text objects

    // Strip HTML tags but preserve line breaks and basic structure
    let plainText = html
      .replace(/<br\s*\/?>/gi, '\n')                    // Convert <br> to newlines
      .replace(/<\/p>/gi, '\n')                          // Convert </p> to newlines
      .replace(/<p[^>]*>/gi, '')                         // Remove <p> opening tags
      .replace(/<li[^>]*>/gi, '\n• ')                    // Convert list items to bullets
      .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')              // Remove list container tags
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')   // Keep bold text (remove tags)
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '$1')             // Keep bold text
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')           // Keep italic text (remove tags)
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '$1')             // Keep italic text
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')             // Keep underlined text (remove tags)
      .replace(/<[^>]+>/g, '')                           // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ')                           // Convert &nbsp; to spaces
      .replace(/&amp;/g, '&')                            // Convert &amp; to &
      .replace(/&lt;/g, '<')                             // Convert &lt; to <
      .replace(/&gt;/g, '>')                             // Convert &gt; to >
      .replace(/&quot;/g, '"')                           // Convert &quot; to "
      .replace(/&#39;/g, "'")                            // Convert &#39; to '
      .replace(/\n\s*\n/g, '\n')                         // Remove multiple consecutive newlines
      .trim();

    return plainText;
  } catch (error) {
    console.warn('Error parsing HTML for PPTX');
    // Fallback: strip all HTML tags
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  }
}

// PowerPoint Generation Function
async function generatePPTX(content, filePath, options) {
  try {
    // Resolve translation language
    const lang = (options?.translateTo && options.translateTo !== 'none') ? options.translateTo : 'EN';
    const t = PDF_TRANSLATIONS[lang] || PDF_TRANSLATIONS.EN;

    const pptx = new PptxGenJS();
    
    // Set presentation properties
    pptx.author = 'DocFAI';
    pptx.company = options?.customization?.companyLogo || 'DocFAI';
    pptx.subject = 'Documentation Export';
    pptx.title = content.name || content.title || 'Documentation';
    
    // Add title slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(content.name || content.title || 'Documentation', {
      x: 1,
      y: 2,
      w: 8,
      h: 1.5,
      fontSize: 36,
      bold: true,
      align: 'center',
      color: options?.customization?.theme === 'dark' ? 'FFFFFF' : '000000'
    });
    
    if (content.projectName) {
      titleSlide.addText(`${t.project}: ${content.projectName}`, {
        x: 1,
        y: 4,
        w: 8,
        h: 1,
        fontSize: 18,
        align: 'center',
        color: options?.customization?.theme === 'dark' ? 'CCCCCC' : '666666'
      });
    }

    // Add generated date in European format to title slide
    titleSlide.addText(`${t.generatedOn} ${formatEuropeanDateTime(new Date())}`, {
      x: 1,
      y: content.projectName ? 4.8 : 4,
      w: 8,
      h: 0.6,
      fontSize: 12,
      align: 'center',
      color: options?.customization?.theme === 'dark' ? '999999' : '888888'
    });
    
    // Determine which steps to process
    // Use actions for step metadata (title, description) and screenshots for images,
    // similar to how PDF generation works
    const actions = content.actions || [];
    let steps = [];

    if (content.isInteractiveScreenshots && content.screenshots) {
      steps = content.screenshots;
    } else if (content.screenshots && content.screenshots.length > 0) {
      steps = content.screenshots;
    } else if (content.documentationSteps && content.documentationSteps.length > 0) {
      steps = content.documentationSteps;
    } else if (content.screenshots) {
      steps = content.screenshots;
    }

    // Process steps and create slides
    if (steps && Array.isArray(steps) && steps.length > 0) {
      steps.forEach((step, index) => {
        const slide = pptx.addSlide();

        // Two-column layout: Narrow text on left, large image on right
        const textColumnWidth = 3.0; // Left column for text
        const imageColumnWidth = 6.0; // Right column for image
        const imageColumnX = 3.5; // Start position for image column

        // Determine title and description — prefer actions array (has step metadata),
        // fall back to screenshot data
        const matchingAction = actions[index];
        const stepTitle = matchingAction?.title || step.title || `${t.step} ${index + 1}`;
        const stepDescription = matchingAction?.description || step.description || '';

        // Add step title in left column
        slide.addText(`${t.step} ${index + 1}: ${stepTitle}`, {
          x: 0.5,
          y: 0.3,
          w: textColumnWidth,
          h: 0.6,
          fontSize: 12,
          bold: true,
          color: options?.customization?.theme === 'dark' ? 'FFFFFF' : '1F4E79',
          align: 'left'
        });

        // Add step description in left column if it exists and is different from title
        if (stepDescription && stepDescription !== stepTitle) {
          // Parse HTML description to extract formatted text
          const formattedText = parseHTMLForPPTX(stepDescription);

          slide.addText(formattedText, {
            x: 0.5,
            y: 1.0,
            w: textColumnWidth,
            h: 4.5,
            fontSize: 8,
            color: options?.customization?.theme === 'dark' ? 'CCCCCC' : '333333',
            valign: 'top',
            align: 'left'
          });
        }

        // Add step timestamp at bottom-left of slide
        if (step.timestamp) {
          slide.addText(`${t.captured}: ${formatEuropeanDateTime(step.timestamp)}`, {
            x: 0.5,
            y: 5.0,
            w: textColumnWidth,
            h: 0.4,
            fontSize: 7,
            italic: true,
            color: options?.customization?.theme === 'dark' ? '999999' : '888888',
            align: 'left'
          });
        }

        // Check if this is a video step with an actual video file to embed
        const isVideoStep = step.mediaType === 'video' && step.videoClipPath;
        if (isVideoStep) {
          // Embed actual video in PowerPoint slide (native playback)
          try {
            const absVideoPath = path.join(getProjectDir(content.projectName || content.name), step.videoClipPath);
            if (fs.existsSync(absVideoPath)) {
              slide.addMedia({
                type: 'video',
                path: absVideoPath,
                x: imageColumnX + 0.25,
                y: 1.0,
                w: imageColumnWidth - 0.5,
                h: 3.2,
              });
              slide.addText('\u25B6 Click to play video', {
                x: imageColumnX + 0.25,
                y: 4.3,
                w: imageColumnWidth - 0.5,
                h: 0.4,
                fontSize: 10,
                italic: true,
                align: 'center',
                color: '666666'
              });
            } else {
              // Video file not found — fallback to thumbnail image
              console.warn('[PPTX] Video file not found, using thumbnail');
              const thumbnailData = step.imageData || step.screenshot;
              if (thumbnailData) {
                slide.addImage({
                  data: thumbnailData,
                  x: imageColumnX + 0.25,
                  y: 1.0,
                  w: imageColumnWidth - 0.5,
                  h: 3.2,
                  sizing: { type: 'contain', w: imageColumnWidth - 0.5, h: 3.2 }
                });
                slide.addText('\u25B6 Video Step (file not available)', {
                  x: imageColumnX + 0.25,
                  y: 4.3,
                  w: imageColumnWidth - 0.5,
                  h: 0.4,
                  fontSize: 10,
                  italic: true,
                  align: 'center',
                  color: '999999'
                });
              }
            }
          } catch (videoError) {
            console.warn('Failed to embed video in slide');
          }
        } else {
          // Add screenshot if available
          const screenshotData = step.screenshot || step.imageData || step.filePath;
          if (screenshotData) {
            try {
              let imageData;
              if (screenshotData.startsWith('data:image/')) {
                // Already a complete data URL
                imageData = screenshotData;
              } else if (screenshotData.startsWith('/') || screenshotData.includes('\\')) {
                 // File path - read the file and create data URL
                 if (fs.existsSync(screenshotData)) {
                   const fileBuffer = fs.readFileSync(screenshotData);
                   const base64Data = fileBuffer.toString('base64');
                   const ext = path.extname(screenshotData).toLowerCase();
                   const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                   imageData = `data:${mimeType};base64,${base64Data}`;
                 } else {
                   throw new Error('Screenshot file not found');
                 }
              } else {
                // Raw base64 — detect JPEG vs PNG from magic bytes
                const pptxMime = screenshotData.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
                imageData = `data:${pptxMime};base64,${screenshotData}`;
              }

              // Position image in right column with proper sizing to avoid stretching
              slide.addImage({
                data: imageData,
                x: imageColumnX + 0.25,
                y: 1.0,
                w: imageColumnWidth - 0.5,
                h: 3.2,
                sizing: {
                  type: 'contain', // Maintain aspect ratio
                  w: imageColumnWidth - 0.5,
                  h: 3.2
                }
              });
            } catch (imageError) {
              console.warn('Failed to add screenshot to slide');
              // Add placeholder text in right column (aligned with image area)
              slide.addText('[Screenshot not available]', {
                x: imageColumnX + 0.25,
                y: 3,
                w: 4,
                h: 1,
                fontSize: 12,
                italic: true,
                align: 'center',
                color: '999999'
              });
            }
          }
        }


      });
    } else {
      // Add a slide indicating no steps available
      const noStepsSlide = pptx.addSlide();
      noStepsSlide.addText('No Documentation Steps Available', {
        x: 0.5,
        y: 4,
        w: 9,
        h: 1,
        fontSize: 24,
        align: 'center',
        color: options?.customization?.theme === 'dark' ? 'FFFFFF' : '000000'
      });
    }
    
    // Save the presentation
     await pptx.writeFile({ fileName: filePath });
   } catch (error) {
     console.error('Error generating PowerPoint');
     throw error;
   }
 }

// Markdown Generation Function
async function generateMarkdown(content, filePath, options) {
  try {
    
    let markdownContent = '';
    
    // Add title
    markdownContent += `# ${content.name || content.title || 'Documentation'}\n\n`;
    
    if (content.projectName) {
      markdownContent += `**Project:** ${content.projectName}\n\n`;
    }
    
    // Determine which steps to process
    let steps = [];
    
    if (content.isInteractiveScreenshots && content.screenshots) {
      steps = content.screenshots;
    } else if (content.documentationSteps && content.documentationSteps.length > 0) {
      steps = content.documentationSteps;
    } else if (content.screenshots && content.screenshots.length > 0) {
      // Fallback: use screenshots even if isInteractiveScreenshots is not set
      steps = content.screenshots;
    }
    
    if (steps.length > 0) {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        const stepNumber = index + 1;
        
        // Add step header
        markdownContent += `## Step ${stepNumber}`;
        
        // Handle different title field names
        const title = step.title || step.name || step.description;
        if (title) {
          markdownContent += `: ${title}`;
        }
        
        markdownContent += '\n\n';
        
        // Add description if available and different from title
        if (step.description && step.description !== title) {
          markdownContent += `${step.description}\n\n`;
        } else if (!step.description && !title) {
          markdownContent += `Screenshot captured at step ${stepNumber}\n\n`;
        }
        
        // Add screenshot reference if available
        const screenshotPath = step.screenshot || step.path || step.filePath || step.diagramImagePath || step.url;
        if (screenshotPath) {
          try {
            let actualFilePath = screenshotPath;
            
            // If we have a project name, construct the proper file path
            if (content.projectName && screenshotPath) {
              // Extract filename from the stored path
              const fileName = screenshotPath.split(/[\/\\]/).pop();
              if (fileName && fileName.includes('.')) {
                // Construct the actual file path using project structure
                const screenshotsDir = getProjectScreenshotsDir(content.projectName);
                actualFilePath = path.join(screenshotsDir, fileName);
              }
            }
            
            // Copy image to images directory and reference it relatively
            if (fs.existsSync(actualFilePath)) {
              // Create images directory next to the markdown file
              const markdownDir = path.dirname(filePath);
              const imagesDir = path.join(markdownDir, 'images');
              await ensureDir(imagesDir);
              
              const fileName = path.basename(actualFilePath);
              const imageDestPath = path.join(imagesDir, fileName);
              
              // Copy the image file
              fs.copyFileSync(actualFilePath, imageDestPath);
              
              // Reference the image with relative path
              markdownContent += `![Step ${stepNumber} Screenshot](./images/${fileName})\n\n`;
            } else {
              markdownContent += `![Step ${stepNumber} Screenshot](${screenshotPath})\n\n`;
            }
          } catch (error) {
            markdownContent += `![Step ${stepNumber} Screenshot](${screenshotPath})\n\n`;
          }
        }
        
        // Add timestamp if available
        if (step.timestamp) {
          markdownContent += `*Captured: ${formatEuropeanDateTime(step.timestamp)}*\n\n`;
        }
        
        markdownContent += '---\n\n';
      }
    } else {
      markdownContent += 'No documentation steps available.\n\n';
    }
    
    // Add footer
    markdownContent += `*Generated by Docfai on ${formatEuropeanDateTime(new Date())}*\n`;
    
    // Save the markdown file
    await writeFile(filePath, markdownContent);
  } catch (error) {
    console.error('Error generating Markdown');
    throw error;
  }
}

// Generate HTML content from recording data
// Translation map for PDF/HTML template strings
const PDF_TRANSLATIONS = {
  EN: {
    step: 'Step',
    documentSummary: 'Document Summary',
    projectName: 'Project Name',
    documentationTitle: 'Documentation Title',
    totalSteps: 'Total Steps',
    generatedDate: 'Generated Date',
    approvals: 'Approvals',
    preparedBy: 'Prepared By',
    approvedBy: 'Approved By',
    name: 'Name',
    date: 'Date',
    generatedBy: 'Generated by Docfai',
    using: 'using',
    template: 'template',
    noSteps: 'No steps recorded.',
    source: 'Source',
    generatedOn: 'Generated on',
    documentId: 'Document ID',
    rev: 'Rev',
    documentation: 'Documentation',
    project: 'Project',
    captured: 'Captured',
    confidential: 'CONFIDENTIAL',
    internal: 'INTERNAL USE ONLY',
    public: 'PUBLIC',
    restricted: 'RESTRICTED'
  },
  DE: {
    step: 'Schritt',
    documentSummary: 'Dokumentzusammenfassung',
    projectName: 'Projektname',
    documentationTitle: 'Dokumentationstitel',
    totalSteps: 'Gesamtschritte',
    generatedDate: 'Erstellungsdatum',
    approvals: 'Genehmigungen',
    preparedBy: 'Erstellt von',
    approvedBy: 'Genehmigt von',
    name: 'Name',
    date: 'Datum',
    generatedBy: 'Erstellt mit Docfai',
    using: 'mit',
    template: 'Vorlage',
    noSteps: 'Keine Schritte aufgezeichnet.',
    source: 'Quelle',
    generatedOn: 'Erstellt am',
    documentId: 'Dokument-ID',
    rev: 'Rev',
    documentation: 'Dokumentation',
    project: 'Projekt',
    captured: 'Aufgenommen',
    confidential: 'VERTRAULICH',
    internal: 'NUR FÜR INTERNEN GEBRAUCH',
    public: 'ÖFFENTLICH',
    restricted: 'EINGESCHRÄNKT'
  }
};

// Translate confidentiality text from English to target language
function translateConfidentialityText(text, lang) {
  if (!text || lang === 'EN') return text;
  const map = {
    'CONFIDENTIAL': PDF_TRANSLATIONS[lang]?.confidential,
    'INTERNAL USE ONLY': PDF_TRANSLATIONS[lang]?.internal,
    'PUBLIC': PDF_TRANSLATIONS[lang]?.public,
    'RESTRICTED': PDF_TRANSLATIONS[lang]?.restricted,
    'CONFIDENTIAL - Internal Use Only': `${PDF_TRANSLATIONS[lang]?.confidential} - ${PDF_TRANSLATIONS[lang]?.internal}`
  };
  return map[text] || text;
}

function generateHTMLContent(content, options) {
  const theme = options?.theme || 'light';
  const template = options?.template || 'detailed';

  // Resolve translation language
  const lang = (options?.translateTo && options.translateTo !== 'none') ? options.translateTo : 'EN';
  const t = PDF_TRANSLATIONS[lang] || PDF_TRANSLATIONS.EN;

  // Check for template configuration from the template system
  const templateConfig = options?.templateConfig;

  // Use template colors if available, otherwise use theme-based defaults
  const colors = templateConfig?.colors ? {
    primary: `#${templateConfig.colors.primary}`,
    secondary: `#${templateConfig.colors.secondary}`,
    text: `#${templateConfig.colors.text}`,
    background: `#${templateConfig.colors.background}`,
    headerBg: `#${templateConfig.colors.headerBg}`,
    headerText: `#${templateConfig.colors.headerText}`,
    border: templateConfig.colors.border ? `#${templateConfig.colors.border}` : '#e5e7eb'
  } : {
    primary: theme === 'dark' ? '#60a5fa' : '#2563eb',
    secondary: theme === 'dark' ? '#9ca3af' : '#6b7280',
    text: theme === 'dark' ? '#ffffff' : '#333333',
    background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
    headerBg: theme === 'dark' ? '#1a1a1a' : '#ffffff',
    headerText: theme === 'dark' ? '#ffffff' : '#1f2937',
    border: theme === 'dark' ? '#444' : '#eee'
  };

  // Use template typography if available
  const typography = templateConfig ? {
    headingFont: templateConfig.headingFont || 'Segoe UI',
    bodyFont: templateConfig.bodyFont || 'Segoe UI',
    fontSize: templateConfig.fontSize || { title: 24, heading1: 20, heading2: 16, body: 12, caption: 10 }
  } : {
    headingFont: 'Segoe UI',
    bodyFont: 'Segoe UI',
    fontSize: { title: 24, heading1: 20, heading2: 16, body: 12, caption: 10 }
  };

  // Template header/footer settings
  const headerConfig = templateConfig?.header || { show: true, includeDate: true };
  const footerConfig = templateConfig?.footer || { show: true, includePageNumbers: true };
  const stepLayoutConfig = templateConfig?.stepLayout || { showStepNumbers: true, numberingStyle: 'decimal', borderStyle: 'none', stepSpacing: 'normal', imageSize: 'large', imagePosition: 'below' };
  const templateOptions = templateConfig?.options || { showDocumentSummary: false, showApprovalSection: false };

  // Step layout helpers
  const getImageMaxHeight = (size) => {
    switch (size) {
      case 'small': return '200px';
      case 'medium': return '300px';
      case 'large': return '400px';
      case 'full-width': return '500px';
      default: return '360px';
    }
  };
  const getImageMaxWidth = (size) => {
    switch (size) {
      case 'small': return '50%';
      case 'medium': return '70%';
      case 'large': return '90%';
      case 'full-width': return '100%';
      default: return '100%';
    }
  };
  const getStepSpacing = (spacing) => {
    switch (spacing) {
      case 'compact': return '15px';
      case 'spacious': return '40px';
      case 'normal':
      default: return '25px';
    }
  };
  const getStepBorder = (style) => {
    switch (style) {
      case 'solid': return `1px solid ${colors.border}`;
      case 'dashed': return `1px dashed ${colors.border}`;
      case 'double': return `3px double ${colors.border}`;
      case 'none':
      default: return 'none';
    }
  };
  const imageMaxHeight = getImageMaxHeight(stepLayoutConfig.imageSize);
  const imageMaxWidth = getImageMaxWidth(stepLayoutConfig.imageSize);
  const stepSpacing = getStepSpacing(stepLayoutConfig.stepSpacing);
  const stepBorder = getStepBorder(stepLayoutConfig.borderStyle);
  const imagePosition = stepLayoutConfig.imagePosition || 'below';
  
  const steps = content.actions || [];
  const screenshots = content.screenshots || [];
  
  // Helper: escape HTML special characters to avoid injection
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Helper: format step number based on template numbering style
  const formatStepNumber = (index) => {
    const style = stepLayoutConfig.numberingStyle || 'decimal';
    switch (style) {
      case 'roman':
        const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
          'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
        return romanNumerals[index] || String(index + 1);
      case 'alpha':
        return String.fromCharCode(65 + index);
      case 'bullet':
        return '•';
      case 'none':
        return '';
      case 'decimal':
      default:
        return String(index + 1);
    }
  };

  // Sanitize HTML to prevent XSS in exported content (Node.js-safe, no DOM needed)
  const sanitizeHtmlForExport = (html) => {
    if (!html) return '';
    return html
      // Strip script/iframe/object/embed tags and their content
      .replace(/<\s*(script|iframe|object|embed|applet|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      // Strip self-closing dangerous tags
      .replace(/<\s*(script|iframe|object|embed|applet|form)[^>]*\/?\s*>/gi, '')
      // Remove event handler attributes (onclick, onerror, onload, etc.)
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // Remove javascript: and data: URLs in href/src/action attributes
      .replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1=""')
      .replace(/(href|src|action)\s*=\s*(?:"data:text\/html[^"]*"|'data:text\/html[^']*')/gi, '$1=""');
  };

  // Helper: collapse excess whitespace in descriptions so user-entered blank lines
  // don't blow up exported page layouts. Mirrors src/utils/normalizeDescription.ts.
  const normalizeDescription = (desc) => {
    if (!desc) return '';
    const hasHtml = /<[^>]+>/.test(desc);
    if (hasHtml) {
      return String(desc)
        .replace(/\r\n/g, '\n')
        .replace(/(\s*<p>(\s*|&nbsp;|<br\s*\/?>)*<\/p>\s*){2,}/gi, '<p><br></p>');
    }
    return String(desc)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(l => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  };

  // Helper: render description preserving HTML formatting from the editor
  const renderDescription = (desc) => {
    if (!desc) return '';

    const normalized = normalizeDescription(desc);
    if (!normalized) return '';

    // Check if description contains HTML tags (formatted content from editor)
    const hasHtmlTags = /<[^>]+>/.test(normalized);

    if (hasHtmlTags) {
      // Description is already HTML from rich text editor
      // Sanitize to prevent XSS while preserving formatting (bold, italic, lists, colors, etc.)
      const sanitized = sanitizeHtmlForExport(normalized);
      return `<div class="step-description" style="margin: 4px 0;">${sanitized}</div>`;
    }

    // Fallback: plain text description - convert to HTML with basic formatting
    const lines = normalized.split('\n').map(l => l.trim());
    const bulletRegex = /^([-*•]|\d+\.)\s+/;
    const bulletLines = lines.filter(l => bulletRegex.test(l) && l.replace(bulletRegex, '').length > 0);
    const nonBulletLines = lines.filter(l => !bulletRegex.test(l) && l.length > 0);

    // If there are at least two bullet lines, render a list
    if (bulletLines.length >= 2) {
      const header = nonBulletLines.length > 0 ? nonBulletLines[0] : null;
      const headerHtml = header
        ? `<p style="margin: 4px 0; font-size: ${typography.fontSize.body}pt; color: ${colors.secondary};">${escapeHtml(header)}</p>`
        : '';
      const itemsHtml = bulletLines
        .map(l => `<li style="margin: 4px 0;">${escapeHtml(l.replace(bulletRegex, ''))}</li>`)
        .join('');
      const listHtml = `<ul style="margin: 4px 0 4px 20px; padding-left: 20px;">${itemsHtml}</ul>`;
      return `${headerHtml}${listHtml}`;
    }

    // Otherwise, preserve line breaks as written
    const joined = lines.join('\n');
    return `<p style="margin: 4px 0; font-size: ${typography.fontSize.body}pt; color: ${colors.secondary}; white-space: pre-line;">${escapeHtml(joined)}</p>`;
  };

  let stepsHTML = '';
  
  // Process steps if they exist, otherwise create steps from screenshots
  if (steps.length > 0) {
    // Match screenshots to steps based on timestamps or order
    const stepElements = steps.map((step, index) => {
      const stepNumber = index + 1;

      // Determine the image to use for this step
      // IMPORTANT: Use index-based matching as the primary method
      // because ExportPage already creates aligned arrays where:
      // - actions[0] corresponds to screenshots[0]
      // - actions[1] corresponds to screenshots[1]
      // etc., regardless of whether they're screenshots or diagrams
      const matchingScreenshot = screenshots[index];

      // Let steps flow naturally — page-break-inside: avoid (in CSS) keeps each
      // step together while allowing multiple steps on the same page when they fit.
      const pageBreakClass = '';

      // Format step title with template numbering style
      const stepPrefix = stepLayoutConfig.showStepNumbers !== false
        ? `${t.step} ${formatStepNumber(index)}: `
        : '';
      const titleToUse = step.title ? `${stepPrefix}${step.title}` : `${t.step} ${formatStepNumber(index)}`;
      // Always show description when present, even if it's the same as the title
      const descriptionToUse = (typeof step.description === 'string' && step.description.length > 0) ? step.description : null;

      // Build step timestamp HTML — prefer screenshot timestamp (epoch) over action timestamp (may be relative offset)
      const rawTimestamp = matchingScreenshot?.timestamp || step.timestamp;
      const stepTimestamp = rawTimestamp ? formatEuropeanDateTime(rawTimestamp) : null;
      const timestampHTML = stepTimestamp
        ? `<p style="margin: 2px 0 0 0; font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary}; text-align: left;">${t.captured}: ${stepTimestamp}</p>`
        : '';

      // Build image HTML
      const imgHTML = matchingScreenshot ? `
        <div class="screenshot-container" style="margin: 8px 0; position: relative; text-align: center; display: flex; justify-content: center;">
          <img src="${matchingScreenshot.imageData}" alt="Screenshot for ${titleToUse}" style="max-width: ${imageMaxWidth}; width: auto; height: auto; max-height: ${imageMaxHeight}; object-fit: contain; border: 1px solid ${colors.border}; border-radius: 4px; margin: 10px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block;" />
        </div>
      ` : '';

      // Build text HTML (title + description + timestamp)
      const textHTML = `
        <div>
          <h3 style="margin: 0 0 6px 0; font-size: ${typography.fontSize.heading2}pt; font-family: ${typography.headingFont}, sans-serif; color: ${colors.primary}; text-align: center;">${titleToUse}</h3>
          ${descriptionToUse ? renderDescription(descriptionToUse) : ''}
          ${timestampHTML}
        </div>
      `;

      // Layout based on imagePosition
      let stepInnerHTML;
      if (imagePosition === 'above') {
        stepInnerHTML = `${imgHTML}${textHTML}`;
      } else if (imagePosition === 'left' || imagePosition === 'right') {
        const imgSide = `<div style="flex: 0 0 45%; max-width: 45%;">${imgHTML}</div>`;
        const textSide = `<div style="flex: 1; min-width: 0;">${textHTML}</div>`;
        stepInnerHTML = imagePosition === 'left'
          ? `<div style="display: flex; gap: 16px; align-items: flex-start;">${imgSide}${textSide}</div>`
          : `<div style="display: flex; gap: 16px; align-items: flex-start;">${textSide}${imgSide}</div>`;
      } else {
        // 'below' (default)
        stepInnerHTML = `${textHTML}${imgHTML}`;
      }

      const stepHTML = `
        <div class="step${pageBreakClass}" style="margin-bottom: ${stepSpacing}; border: ${stepBorder}; ${stepBorder !== 'none' ? 'border-radius: 8px; padding: 16px;' : 'padding: 10px 0;'}">
          <div class="step-content">
            ${stepInnerHTML}
          </div>
        </div>
      `;

      return stepHTML;
    });
    stepsHTML = stepElements.join('');
  } else if (screenshots.length > 0) {
    // If no steps but we have screenshots, create steps from screenshots
    // Let screenshot steps flow naturally — multiple can fit on one page
    const stepElements = screenshots.map((screenshot, index) => {
      const stepNumber = index + 1;
      const pageBreakClass = '';

      const screenshotTimestamp = screenshot.timestamp ? formatEuropeanDateTime(screenshot.timestamp) : null;
      return `
        <div class="step${pageBreakClass}" style="margin-bottom: ${stepSpacing}; border: ${stepBorder}; ${stepBorder !== 'none' ? 'border-radius: 8px; padding: 16px;' : 'padding: 10px 0;'}">
          <div class="step-content">
            <h3>${t.step} ${stepNumber}</h3>
            <div class="screenshot-container" style="display: flex; justify-content: center; text-align: center;">
              <img src="${screenshot.imageData}" alt="Screenshot ${stepNumber}" style="max-width: ${imageMaxWidth}; width: auto; height: auto; max-height: ${imageMaxHeight}; object-fit: contain; border: 1px solid ${colors.border}; border-radius: 4px; margin: 10px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block;" />
              ${screenshot.clickX && screenshot.clickY ? `
                <div class="click-indicator" style="position: relative; margin-top: -10px;">
                  <div style="position: absolute; left: ${Math.min(screenshot.clickX / 10, 90)}%; top: -20px; width: 20px; height: 20px; background: #ef4444; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
                </div>
              ` : ''}
            </div>
            ${screenshotTimestamp ? `<p style="margin: 2px 0 0 0; font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary}; text-align: left;">${t.captured}: ${screenshotTimestamp}</p>` : ''}
          </div>
        </div>
      `;
    });
    stepsHTML = stepElements.join('');
  }
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${content.name || 'Documentation'}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: '${typography.bodyFont}', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: ${typography.fontSize.body}pt;
          line-height: 1.4;
          color: ${colors.text};
          background-color: ${colors.background};
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          text-align: left;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 1px solid ${colors.border};
          padding-bottom: 15px;
          padding-top: 0px;
        }
        .company-logo {
          width: 80px;
          height: 60px;
          object-fit: contain;
          margin-bottom: 10px;
        }
        .header h1 {
          font-family: '${typography.headingFont}', sans-serif;
          color: ${colors.primary};
          margin: 0 0 3px 0;
          font-size: ${typography.fontSize.title}pt;
        }
        .step {
          margin-bottom: ${stepSpacing};
          padding-top: 10px;
        }
        .step.page-break-before {
          page-break-before: auto;
          break-before: auto;
        }
        .step-content {
          text-align: left;
          width: 100%;
        }
        .step-content h3 {
          font-family: '${typography.headingFont}', sans-serif;
          margin: 0 0 6px 0;
          font-size: ${typography.fontSize.heading2}pt;
          color: ${colors.primary};
          text-align: center;
        }
        .step-content p {
          margin: 4px 0;
          font-size: ${typography.fontSize.body}pt;
          color: ${colors.secondary};
        }
        .step-description {
          /* Container for rich text editor HTML content */
          text-align: left;
          margin: 4px 0;
          font-size: ${typography.fontSize.body}pt;
          line-height: 1.6;
        }
        .step-description > * {
          /* Allow child elements to inherit default color unless explicitly styled */
          color: inherit;
        }
        .step-description p {
          margin: 4px 0;
          font-size: ${typography.fontSize.body}pt;
          color: ${colors.secondary};
        }
        .step-description strong,
        .step-description b {
          font-weight: bold !important;
        }
        .step-description em,
        .step-description i {
          font-style: italic !important;
        }
        .step-description u {
          text-decoration: underline !important;
        }
        .step-description ul,
        .step-description ol {
          margin: 4px 0 4px 20px;
          padding-left: 20px;
          text-align: left;
        }
        .step-description li {
          margin: 2px 0;
        }
        /* Support for Quill editor classes */
        .step-description .ql-align-center {
          text-align: center;
        }
        .step-description .ql-align-right {
          text-align: right;
        }
        .step-description .ql-align-left {
          text-align: left;
        }
        .step-description .ql-align-justify {
          text-align: justify;
        }
        .step-description .ql-size-small {
          font-size: 0.75em;
        }
        .step-description .ql-size-large {
          font-size: 1.5em;
        }
        .step-description .ql-size-huge {
          font-size: 2.5em;
        }
        .step-description .ql-font-arial {
          font-family: Arial, sans-serif;
        }
        .step-description .ql-font-times-new-roman {
          font-family: 'Times New Roman', serif;
        }
        .step-description .ql-font-courier {
          font-family: 'Courier New', monospace;
        }
        .step-description .ql-font-georgia {
          font-family: Georgia, serif;
        }
        .step-description .ql-font-verdana {
          font-family: Verdana, sans-serif;
        }
        .step-description .ql-font-helvetica {
          font-family: Helvetica, sans-serif;
        }
        .step-description .ql-font-calibri {
          font-family: Calibri, sans-serif;
        }
        .screenshot-container {
          margin: 8px 0;
          position: relative;
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .screenshot-container img {
          max-width: ${imageMaxWidth};
          width: auto;
          height: auto;
          max-height: ${imageMaxHeight};
          object-fit: contain;
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .click-indicator {
          position: relative;
          height: 0;
        }
        .footer {
          text-align: center;
          margin-top: 5px;
          padding-top: 3px;
          border-top: 1px solid ${colors.border};
          color: ${colors.secondary};
          font-size: ${typography.fontSize.caption}pt;
        }

        /* Ensure top/bottom margins on every printed page */
        @page {
          margin-top: 15mm;
          margin-bottom: 10mm;
        }

        /* Print styles - keep steps together, allow multiple per page */
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Let each step's content flow naturally within its own page.
             Avoiding page-break-inside on .step caused blank-page gutters
             when a step exceeded one page height. Orphans/widows keep
             text readable when a step does split across pages. */
          .step {
            orphans: 3;
            widows: 3;
          }

          /* Force every step (except the first) onto a new page so titles
             never get orphaned from their content and images never end up on
             a separate page from their step text. */
          .step + .step {
            page-break-before: always !important;
            break-before: always !important;
          }

          /* Bind the step title to the first line of the description */
          .step h2,
          .step h3,
          .step-content h2,
          .step-content h3 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Keep screenshots atomic — an image should never be split mid-pixel */
          .screenshot-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Header stays on first page */
          .header {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Summary table stays together */
          .summary {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Approval section on its own page */
          .approval-section {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
      </style>
    </head>
    <body style="font-family: '${typography.bodyFont}', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.4; color: ${colors.text}; background-color: ${colors.background}; max-width: 800px; margin: 0 auto; padding: 8px; padding-top: 10px; text-align: center;">
      ${headerConfig.show !== false ? `
      <div class="header" style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid ${colors.border}; padding-bottom: 15px; padding-top: 0px;">
        ${options?.customization?.logo || templateConfig?.header?.companyLogo ? `<img src="${options?.customization?.logo || templateConfig?.header?.companyLogo}" alt="Company Logo" class="company-logo" />` : ''}
        ${templateConfig?.header?.companyName ? `<p style="margin: 0 0 8px 0; font-size: ${typography.fontSize.body}pt; font-weight: bold; color: ${colors.headerText};">${templateConfig.header.companyName}</p>` : ''}
        <h1 style="font-family: '${typography.headingFont}', sans-serif; color: ${colors.primary}; font-size: ${typography.fontSize.title}pt;">${content.name || t.documentation}</h1>
        ${content.source ? `<p style="margin: 0; font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary};"><strong>${t.source}:</strong> ${content.source}</p>` : ''}
        ${headerConfig.includeDate !== false ? `<p style="margin: 0; font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary};">${t.generatedOn} ${formatEuropeanDateTime(new Date())}</p>` : ''}
        ${templateConfig?.header?.documentId ? `<p style="margin: 0; font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary};">${t.documentId}: ${templateConfig.header.documentId}${templateConfig.header.revision ? ` | ${t.rev} ${templateConfig.header.revision}` : ''}</p>` : ''}
      </div>
      ` : ''}

      ${templateOptions.showDocumentSummary ? `
      <div class="summary" style="text-align: left; margin-bottom: 24px; padding: 16px; background: ${colors.headerBg}15; border-radius: 8px;">
        <h2 style="font-family: '${typography.headingFont}', sans-serif; color: ${colors.primary}; font-size: ${typography.fontSize.heading1}pt; margin: 0 0 12px 0;">${t.documentSummary}</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border: 1px solid ${colors.border}; font-weight: bold; background: ${colors.headerBg}20;">${t.projectName}</td><td style="padding: 8px; border: 1px solid ${colors.border};">${content.projectName || 'N/A'}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid ${colors.border}; font-weight: bold; background: ${colors.headerBg}20;">${t.documentationTitle}</td><td style="padding: 8px; border: 1px solid ${colors.border};">${content.name || t.documentation}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid ${colors.border}; font-weight: bold; background: ${colors.headerBg}20;">${t.totalSteps}</td><td style="padding: 8px; border: 1px solid ${colors.border};">${steps.length || screenshots.length}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid ${colors.border}; font-weight: bold; background: ${colors.headerBg}20;">${t.generatedDate}</td><td style="padding: 8px; border: 1px solid ${colors.border};">${formatEuropeanDateTime(new Date())}</td></tr>
        </table>
      </div>
      ` : ''}

      <div class="content" style="text-align: center;">
        ${stepsHTML || `<p style="text-align: center;">${t.noSteps}</p>`}
      </div>

      ${templateOptions.showApprovalSection ? `
      <div class="approval-section" style="page-break-before: always; margin-top: 48px;">
        <h2 style="font-family: '${typography.headingFont}', sans-serif; color: ${colors.primary}; font-size: ${typography.fontSize.heading1}pt; margin: 0 0 24px 0; text-align: center;">${t.approvals}</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 16px; border: 1px solid ${colors.border}; width: 50%; text-align: center; background: ${colors.headerBg}15;">
              <strong>${t.preparedBy}</strong>
              <div style="height: 60px; margin: 16px 0 8px 0; border-bottom: 1px solid ${colors.text};"></div>
              <div>${t.name}: _________________</div>
              <div>${t.date}: _________________</div>
            </td>
            <td style="padding: 16px; border: 1px solid ${colors.border}; width: 50%; text-align: center; background: ${colors.headerBg}15;">
              <strong>${t.approvedBy}</strong>
              <div style="height: 60px; margin: 16px 0 8px 0; border-bottom: 1px solid ${colors.text};"></div>
              <div>${t.name}: _________________</div>
              <div>${t.date}: _________________</div>
            </td>
          </tr>
        </table>
      </div>
      ` : ''}

      ${footerConfig.show !== false ? `
      <div class="footer" style="text-align: center; margin-top: 5px; padding-top: 3px; border-top: 1px solid ${colors.border}; color: ${colors.secondary}; font-size: ${typography.fontSize.caption}pt;">
        <p style="text-align: center;">
          ${footerConfig.confidentialityText ? `${translateConfidentialityText(footerConfig.confidentialityText, lang)} | ` : ''}
          ${t.generatedBy}${templateConfig?.options?.templateName ? ` ${t.using} ${templateConfig.options.templateName} ${t.template}` : ''}
        </p>
      </div>
      ` : ''}
    </body>
    </html>
  `;
}

// Video export handler
ipcMain.handle('export-video', async (event, data) => {
  try {
    
    const { format, filePath, options, outputPath, projectName } = data;
    const { trimStart, trimEnd } = options || {};
    
    // Get format extension mapping
    const formatExtensions = {
      'mp4': 'mp4',
      'webm': 'webm', 
      'avi': 'avi',
      'mov': 'mov'
    };
    
    const extension = formatExtensions[format] || 'mp4';
    
    // Use project name as default filename with correct extension
    const defaultFileName = projectName ? `${projectName}.${extension}` : `video.${extension}`;
    
    // Show save dialog for video export with correct extension
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Video',
      defaultPath: outputPath ? outputPath.replace(/\.[^.]+$/, `.${extension}`) : defaultFileName,
      filters: [
        { name: `${format.toUpperCase()} Video`, extensions: [extension] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    const outputFilePath = result.filePath;

    // Import FFmpeg for video processing (needed for metadata check and potential processing)
    const { default: ffmpeg } = await import('fluent-ffmpeg');

    // Set FFmpeg binary paths
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    } else {
      console.error('❌ FFmpeg binary not found - export will fail for non-WebM formats');
      return {
        success: false,
        error: 'Video export failed: Cannot find ffmpeg binary. Please ensure FFmpeg is properly installed.'
      };
    }

    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
    }

    // Get video metadata to check actual duration
    let videoDuration = 0;
    try {
      const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      videoDuration = parseFloat(metadata?.format?.duration) || 0;
    } catch (error) {
      console.error('Failed to get video metadata');
      // If metadata extraction fails, assume trimming is needed to be safe
      videoDuration = trimEnd || 0;
    }

    // FAST PATH: If no processing needed, just copy the file
    // Conditions: same format (WebM→WebM), no trimming, no quality changes
    const sourceExtension = path.extname(filePath).toLowerCase().replace('.', '');
    const isSameFormat = sourceExtension === extension;

    // Check if trimming is actually needed (not just default values)
    // Trimming is needed if:
    // - trimStart > 0 (cutting from beginning)
    // - trimEnd < videoDuration - 0.1 (cutting from end, with small tolerance for rounding)
    const needsTrimming = (trimStart && trimStart > 0) ||
                         (trimEnd && videoDuration > 0 && trimEnd < videoDuration - 0.1);


    if (isSameFormat && !needsTrimming) {
      try {
        // Simple file copy - instant and no CPU usage!
        await fs.promises.copyFile(filePath, outputFilePath);
        return {
          success: true,
          outputPath: outputFilePath,
          message: 'Video exported successfully (fast copy)'
        };
      } catch (copyError) {
        console.error('Fast copy failed, falling back to FFmpeg');
        // Fall through to FFmpeg processing below
      }
    }

    
    return new Promise((resolve) => {
      let command = ffmpeg(filePath);
      
      // Apply trimming if specified
      if (trimStart !== undefined && trimStart > 0) {
        command = command.seekInput(trimStart);
      }
      
      if (trimEnd !== undefined && trimStart !== undefined && trimEnd > trimStart) {
        const duration = trimEnd - trimStart;
        command = command.duration(duration);
      } else if (trimEnd !== undefined && trimStart === undefined) {
        command = command.duration(trimEnd);
      }
      
      // Determine video bitrate and CRF based on quality and compression settings
      const quality = options?.quality || '1080p';
      const compression = options?.compression || 'medium';

      // Calculate bitrate based on quality setting
      let videoBitrate = '8000k'; // Default for 1080p medium
      let crf = 23; // Default CRF (lower = better quality)

      if (quality === '2k') {
        // 2K resolution (2560x1440)
        videoBitrate = compression === 'low' ? '20000k' : compression === 'high' ? '10000k' : '15000k';
        crf = compression === 'low' ? 18 : compression === 'high' ? 28 : 20;
      } else if (quality === '1080p') {
        // Full HD (1920x1080)
        videoBitrate = compression === 'low' ? '12000k' : compression === 'high' ? '5000k' : '8000k';
        crf = compression === 'low' ? 18 : compression === 'high' ? 28 : 23;
      } else if (quality === '720p') {
        // HD (1280x720)
        videoBitrate = compression === 'low' ? '8000k' : compression === 'high' ? '3000k' : '5000k';
        crf = compression === 'low' ? 20 : compression === 'high' ? 30 : 25;
      }


      const frameRate = options?.frameRate || 30;

      // Set output format and codec based on selected format with quality parameters
      switch (format) {
        case 'webm':
          command = command
            .videoCodec('libvpx-vp9')
            .audioCodec('libvorbis')
            .videoBitrate(videoBitrate)
            .fps(frameRate)             // Set output frame rate from user settings
            .outputOptions([
              `-crf ${crf}`,           // Quality control (0-63, lower = better)
              `-b:v ${videoBitrate}`,  // Video bitrate
              '-quality good',         // Encoding quality preset
              '-cpu-used 1',           // Speed vs quality (0=slowest/best, 5=fastest/worst)
              '-row-mt 1',             // Multi-threading for faster encoding
              `-g ${frameRate * 2}`,   // GOP size (~2 seconds of keyframe interval)
              `-keyint_min ${frameRate}` // Minimum keyframe interval (~1 second)
            ]);
          break;
        case 'avi':
        case 'mov':
          command = command
            .videoCodec('libx264')
            .audioCodec('aac')
            .videoBitrate(videoBitrate)
            .fps(frameRate)             // Set output frame rate from user settings
            .outputOptions([
              `-crf ${crf}`,           // Quality control (0-51, lower = better)
              '-preset medium',        // Encoding speed preset
              '-pix_fmt yuv420p',      // Pixel format for compatibility
              '-movflags +faststart',  // Enable fast start for web playback
              `-g ${frameRate * 2}`,   // GOP size (~2 seconds of keyframe interval)
              `-keyint_min ${frameRate}` // Minimum keyframe interval (~1 second)
            ]);
          break;
        case 'mp4':
        default:
          command = command
            .videoCodec('libx264')
            .audioCodec('aac')
            .videoBitrate(videoBitrate)
            .fps(frameRate)             // Set output frame rate from user settings
            .outputOptions([
              `-crf ${crf}`,           // Quality control (0-51, lower = better)
              '-preset medium',        // Encoding speed preset
              '-pix_fmt yuv420p',      // Pixel format for compatibility
              '-movflags +faststart',  // Enable fast start for web playback
              `-g ${frameRate * 2}`,   // GOP size (~2 seconds of keyframe interval)
              `-keyint_min ${frameRate}` // Minimum keyframe interval (~1 second)
            ]);
          break;
      }
      
      command
        .on('start', (commandLine) => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('export-progress', {
              type: 'start',
              message: 'Starting video export...'
            });
          }
        })
        .on('progress', (progress) => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('export-progress', {
              type: 'progress',
              progress: progress.percent || 0,
              message: `Exporting video: ${Math.round(progress.percent || 0)}% done`
            });
          }
        })
        .on('end', () => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('export-progress', {
              type: 'complete',
              message: 'Video export completed!'
            });
          }
          resolve({ success: true, outputPath: outputFilePath });
        })
        .on('error', (err) => {
          console.error('FFmpeg export error');
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('export-progress', {
              type: 'error',
              message: `Export failed: ${err.message}`
            });
          }
          resolve({ success: false, error: `Video export failed: ${err.message}` });
        })
        .save(outputFilePath);
    });
    
  } catch (error) {
    console.error('Error in export-video');
    return { success: false, error: error.message };
  }
});



// Save temporary file handler
ipcMain.handle('save-temporary-file', async (event, buffer, filename) => {
  try {

    // Create temp directory in userData (writable in production)
    const userDataPath = app.getPath('userData');
    const tempDir = path.join(userDataPath, 'temp', 'uploads');
    await ensureDir(tempDir);
    
    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const uniqueFilename = `${baseName}_${timestamp}${ext}`;
    const tempFilePath = path.join(tempDir, uniqueFilename);
    
    // Write buffer to file
    await writeFile(tempFilePath, Buffer.from(buffer));
    
    return tempFilePath;
  } catch (error) {
    console.error('Failed to save temporary file');
    throw new Error(`Failed to save temporary file: ${error.message}`);
  }
});

// Video processing handlers
ipcMain.handle('extract-video-frames', async (event, videoPath, options) => {
  try {
    
    // Import required modules
    const { default: ffmpeg } = await import('fluent-ffmpeg');

    // Set FFmpeg binary paths
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
    }

    // Create output directory for frames in userData (writable in production)
    const userDataPath = app.getPath('userData');
    const framesDir = path.join(userDataPath, 'temp', 'frames');
    await ensureDir(framesDir);
    
    // Extract frames using ffmpeg directly
    const frames = [];
    const { interval = 5, maxFrames = 10 } = options || {};
    
    return new Promise((resolve, reject) => {
      let frameCount = 0;
      
      // First get video duration
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('FFprobe error');
          reject(new Error(`Could not analyze video: ${err.message}`));
          return;
        }
        
        const duration = metadata.format.duration || metadata.streams[0].duration;
        
        if (!duration || isNaN(duration)) {
          console.warn('Could not determine video duration, using fallback method');
          // Fallback: extract frames at fixed intervals without duration
           ffmpeg(videoPath)
             .on('start', (commandLine) => {
             })
             .on('progress', (progress) => {
               if (mainWindow && mainWindow.webContents) {
                 mainWindow.webContents.send('frame-extraction-progress', {
                   type: 'progress',
                   progress: progress.percent || 0,
                   message: `Extracting frames: ${progress.percent || 0}% done`
                 });
               }
             })
             .on('end', async () => {
                try {
                  // Build frame objects from generated files
                  const fs = await import('fs');
                  const files = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_') && f.endsWith('.png'));
                  files.forEach((filename, index) => {
                    frames.push({
                      path: path.join(framesDir, filename),
                      timestamp: index * interval,
                      index: index
                    });
                  });
                  resolve(frames);
                } catch (fsError) {
                  console.error('Error reading frame files');
                  reject(new Error(`Failed to read extracted frames: ${fsError.message}`));
                }
              })
             .on('error', (err) => {
               console.error('FFmpeg error');
               reject(new Error(`Frame extraction failed: ${err.message}`));
             })
             .outputOptions([
               '-vf', `fps=1/${interval}`,
               '-frames:v', maxFrames.toString()
             ])
             .output(path.join(framesDir, 'frame_%03d.png'))
             .run();
          return;
        }
        
        // Calculate timemarks for frame extraction
        const timemarks = [];
        const actualMaxFrames = Math.min(maxFrames, Math.floor(duration / interval));
        
        for (let i = 0; i < actualMaxFrames; i++) {
          timemarks.push(i * interval);
        }
        
        
        ffmpeg(videoPath)
          .on('start', (commandLine) => {
          })
          .on('progress', (progress) => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('frame-extraction-progress', {
                type: 'progress',
                progress: progress.percent || 0,
                message: `Extracting frames: ${progress.percent || 0}% done`
              });
            }
          })
          .on('end', () => {
            resolve(frames);
          })
          .on('error', (err) => {
            console.error('FFmpeg error');
            reject(new Error(`Frame extraction failed: ${err.message}`));
          })
          .screenshots({
            timemarks: timemarks,
            folder: framesDir,
            filename: 'frame_%03d.png',
            size: '1280x720'
          })
          .on('filenames', (filenames) => {
            // Build frame objects
            filenames.forEach((filename, index) => {
              frames.push({
                path: path.join(framesDir, filename),
                timestamp: timemarks[index] || index * interval,
                index: index
              });
            });
          });
      });
    });
  } catch (error) {
    console.error('Frame extraction failed');
    throw new Error(`Frame extraction failed: ${error.message}`);
  }
});

// Extract frames at bookmark timestamps and generate documentation steps
ipcMain.handle('extract-steps-from-bookmarks', async (event, videoPath, projectName, bookmarks) => {
  try {

    if (!bookmarks || bookmarks.length === 0) {
      return { success: false, error: 'No bookmarks provided' };
    }

    // Resolve video path
    let resolvedVideoPath = videoPath;
    if (!path.isAbsolute(videoPath)) {
      const projectDir = getProjectDir(projectName);
      resolvedVideoPath = path.join(projectDir, videoPath);
    }

    if (!fs.existsSync(resolvedVideoPath)) {
      throw new Error(`Video file not found: ${resolvedVideoPath}`);
    }

    const screenshotsDir = getProjectScreenshotsDir(projectName);
    await ensureDir(screenshotsDir);

    // Import ffmpeg
    const { default: ffmpegLib } = await import('fluent-ffmpeg');
    if (ffmpegPath) ffmpegLib.setFfmpegPath(ffmpegPath);
    if (ffprobePath) ffmpegLib.setFfprobePath(ffprobePath);

    // Send initial progress
    if (mainWindow) {
      mainWindow.webContents.send('scene-detection-progress', {
        stage: 'extracting',
        progress: 5,
        message: `Extracting ${bookmarks.length} frames from bookmarks...`
      });
    }

    const steps = [];
    const total = bookmarks.length;

    for (let i = 0; i < total; i++) {
      const bookmark = bookmarks[i];
      const timestampSec = bookmark.timestamp / 1000; // ms → seconds
      const stepNumber = i + 1;
      const filename = `bookmark_step_${stepNumber.toString().padStart(3, '0')}.png`;
      const outputPath = path.join(screenshotsDir, filename);

      try {
        // Extract single frame at bookmark timestamp
        await new Promise((resolve, reject) => {
          ffmpegLib(resolvedVideoPath)
            .seekInput(timestampSec)
            .frames(1)
            .outputOptions(['-q:v', '2'])
            .output(outputPath)
            .on('end', resolve)
            .on('error', (err) => reject(err))
            .run();
        });

        const stepId = `bookmark_${bookmark.id || Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        steps.push({
          id: stepId,
          timestamp: timestampSec, // Seconds — consistent with video duration for timeline positioning
          title: bookmark.title || `Step ${stepNumber}`,
          description: bookmark.description || '',
          screenshot: `step_by_step_screenshots/${filename}`,
          actionType: 'navigate',
          element: '',
          isGenerated: true,
        });

        // Progress: 5-95%
        const pct = 5 + Math.round(((i + 1) / total) * 90);
        if (mainWindow) {
          mainWindow.webContents.send('scene-detection-progress', {
            stage: 'extracting',
            progress: pct,
            message: `Extracted step ${stepNumber} of ${total}...`
          });
        }
      } catch (err) {
        console.error(`Failed to extract frame at bookmark ${timestampSec}s`);
        // Skip failed frame, continue with next
      }
    }

    return { success: true, steps, stepCount: steps.length };

  } catch (error) {
    console.error('Bookmark step extraction failed');
    return { success: false, error: error.message };
  }
});

// Generate a high-quality thumbnail from a video file
ipcMain.handle('generate-video-thumbnail', async (event, projectName, videoClipPath) => {
  try {

    // Resolve absolute video path
    const projectDir = getProjectDir(projectName);
    const absVideoPath = path.join(projectDir, videoClipPath);

    if (!fs.existsSync(absVideoPath)) {
      throw new Error(`Video file not found: ${absVideoPath}`);
    }

    // Create temp directory for thumbnail
    const thumbnailDir = path.join(app.getPath('userData'), 'temp', 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    const thumbnailFileName = `thumb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFileName);

    const { default: ffmpeg } = await import('fluent-ffmpeg');
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
    if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

    // Get video duration to pick a safe timestamp
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(absVideoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });

    // Extract at 1s or 10% of duration (whichever is smaller), fallback to 0.1s for very short videos
    const timestamp = duration > 1 ? Math.min(1, duration * 0.1) : 0.1;

    // Extract single frame as PNG at 1280px width
    await new Promise((resolve, reject) => {
      ffmpeg(absVideoPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .screenshots({
          timestamps: [timestamp],
          folder: thumbnailDir,
          filename: thumbnailFileName,
          size: '1280x?'
        });
    });

    // Read the thumbnail and convert to base64 data URL
    if (!fs.existsSync(thumbnailPath)) {
      throw new Error('Thumbnail file was not created');
    }

    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const base64Data = thumbnailBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Data}`;

    // Clean up temp file
    try { fs.unlinkSync(thumbnailPath); } catch (e) { /* ignore cleanup errors */ }

    return dataUrl;
  } catch (error) {
    console.error('❌ Failed to generate video thumbnail');
    throw new Error(`Failed to generate video thumbnail: ${error.message}`);
  }
});

// File URL handler for local screenshots
ipcMain.handle('get-file-url', async (event, filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.warn('File not found');
      return null; // Return null instead of throwing error
    }

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    // Read file and convert to data URL with correct MIME type
    const fileBuffer = fs.readFileSync(filePath);
    const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    return dataUrl;
  } catch (error) {
    console.error('Failed to get file URL');
    return null; // Return null instead of throwing error
  }
});

// Project-based file management
function getProjectsDir() {
  return path.join(os.homedir(), 'Documents', 'Docfai Projects');
}

const WINDOWS_RESERVED_FILENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function truncatePathSegment(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const ext = path.extname(value);
  if (ext && ext.length < maxLength - 1) {
    const base = value.slice(0, -ext.length).slice(0, maxLength - ext.length);
    return `${base}${ext}`;
  }

  return value.slice(0, maxLength);
}

function avoidReservedWindowsFilename(value) {
  const ext = path.extname(value);
  const base = ext ? value.slice(0, -ext.length) : value;

  if (WINDOWS_RESERVED_FILENAME_RE.test(base)) {
    return `_${value}`;
  }

  return value;
}

function sanitizeProjectName(name) {
  if (!name || typeof name !== 'string') {
    console.warn('sanitizeProjectName received invalid name');
    return 'untitled_project';
  }

  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+$/g, '');

  const safeName = avoidReservedWindowsFilename(sanitized || 'untitled_project');
  return truncatePathSegment(safeName, 120);
}

function sanitizeProjectFileName(fileName, fallback = 'untitled_file') {
  if (!fileName || typeof fileName !== 'string') {
    return fallback;
  }

  const sanitized = fileName
    .replace(/[<>:"|?*\x00-\x1F\x7F]/g, '_')
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  const safeName = avoidReservedWindowsFilename(sanitized || fallback);
  return truncatePathSegment(safeName, 180);
}

function getProjectDir(projectName) {
  const sanitized = sanitizeProjectName(projectName);
  return path.join(getProjectsDir(), sanitized);
}

function getProjectRecordingsDir(projectName) {
  return path.join(getProjectDir(projectName), 'recordings');
}

function getProjectScreenshotsDir(projectName) {
  return path.join(getProjectDir(projectName), 'step_by_step_screenshots');
}

function getProjectExportsDir(projectName) {
  return path.join(getProjectDir(projectName), 'exports');
}

function getProjectUploadsDir(projectName) {
  return path.join(getProjectDir(projectName), 'uploads');
}

function getProjectDiagramsDir(projectName) {
  return path.join(getProjectDir(projectName), 'diagrams');
}

// Create project folder structure
ipcMain.handle('create-project-folder', async (event, projectName) => {
  try {
    // Sanitize project name to ensure it's valid for folder creation
    const sanitizedName = sanitizeProjectName(projectName);

    const projectDir = getProjectDir(projectName);
    const recordingsDir = getProjectRecordingsDir(projectName);
    const screenshotsDir = getProjectScreenshotsDir(projectName);
    const exportsDir = getProjectExportsDir(projectName);
    const uploadsDir = getProjectUploadsDir(projectName);
    const diagramsDir = getProjectDiagramsDir(projectName);

    await ensureDir(projectDir);
    await ensureDir(recordingsDir);
    await ensureDir(screenshotsDir);
    await ensureDir(exportsDir);
    await ensureDir(uploadsDir);
    await ensureDir(diagramsDir);

    return {
      success: true,
      path: projectDir,
      projectDir,
      recordingsDir,
      screenshotsDir,
      exportsDir,
      uploadsDir,
      diagramsDir
    };
  } catch (error) {
    console.error('Failed to create project folder');
    
    return {
      success: false,
      error: error.message || 'Unknown error occurred while creating project folder'
    };
  }
});

// Save recording to project folder
ipcMain.handle('save-project-recording', async (event, projectName, fileName, videoData) => {
  try {
    const recordingsDir = getProjectRecordingsDir(projectName);
    await ensureDir(recordingsDir);
    
    const sanitizedFileName = sanitizeProjectFileName(fileName, 'recording');
    
    // Ensure fileName has a proper extension
    let finalFileName = sanitizedFileName;
    if (!path.extname(sanitizedFileName)) {
      // Add default .webm extension if no extension is present
      finalFileName = `${sanitizedFileName}.webm`;
    }
    
    if (sanitizedFileName !== fileName) {
    }
    
    const filePath = path.join(recordingsDir, finalFileName);
    const buffer = Buffer.from(videoData);

    await writeFile(filePath, buffer);
    
    return {
      filePath,
      relativePath: path.join('recordings', finalFileName)
    };
  } catch (error) {
    console.error('Failed to save project recording');
    throw new Error(`Failed to save recording: ${error.message}`);
  }
});

// Save screenshot to project folder
ipcMain.handle('save-project-screenshot', async (event, projectName, fileName, screenshotData) => {
  try {
    const screenshotsDir = getProjectScreenshotsDir(projectName);
    await ensureDir(screenshotsDir);
    
    const sanitizedFileName = sanitizeProjectFileName(fileName, 'screenshot.png');
    
    if (sanitizedFileName !== fileName) {
    }
    
    const filePath = path.join(screenshotsDir, sanitizedFileName);
    
    // Handle both base64 and buffer data
    let buffer;
    if (typeof screenshotData === 'string') {
      // Remove data URL prefix if present
      const base64Data = screenshotData.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      buffer = Buffer.from(screenshotData);
    }

    await writeFile(filePath, buffer);
    
    return {
      filePath,
      relativePath: path.join('step_by_step_screenshots', sanitizedFileName)
    };
  } catch (error) {
    console.error('Failed to save project screenshot');
    throw new Error(`Failed to save screenshot: ${error.message}`);
  }
});

// Save exported file to project exports folder
ipcMain.handle('save-project-export', async (event, projectName, fileName, fileData, fileType = 'buffer') => {
  try {
    const exportsDir = getProjectExportsDir(projectName);
    await ensureDir(exportsDir);
    
    const sanitizedFileName = sanitizeProjectFileName(fileName, 'export');
    
    if (sanitizedFileName !== fileName) {
    }
    
    const filePath = path.join(exportsDir, sanitizedFileName);
    
    let buffer;
    if (fileType === 'base64') {
      buffer = Buffer.from(fileData, 'base64');
    } else if (fileType === 'blob' || fileData instanceof ArrayBuffer) {
      buffer = Buffer.from(fileData);
    } else {
      buffer = Buffer.from(fileData);
    }
    
    await writeFile(filePath, buffer);
    
    return {
      filePath,
      relativePath: path.join('exports', sanitizedFileName)
    };
  } catch (error) {
    console.error('Failed to save project export');
    throw new Error(`Failed to save export: ${error.message}`);
  }
});

// Open an exported file with the system default application
ipcMain.handle('open-exported-file', async (event, filePath) => {
  try {
    const result = await shell.openPath(filePath);
    if (result) {
      // shell.openPath returns an error string on failure, empty string on success
      return { success: false, error: result };
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to open exported file');
    return { success: false, error: error.message };
  }
});

// Save uploaded video to project uploads folder
ipcMain.handle('save-project-upload', async (event, projectName, fileName, videoData) => {
  try {
    const uploadsDir = getProjectUploadsDir(projectName);
    await ensureDir(uploadsDir);
    
    const sanitizedFileName = sanitizeProjectFileName(fileName, 'upload');
    
    if (sanitizedFileName !== fileName) {
    }
    
    const filePath = path.join(uploadsDir, sanitizedFileName);
    const buffer = Buffer.from(videoData);
    
    await writeFile(filePath, buffer);
    
    return {
      success: true,
      path: filePath,
      relativePath: path.join('uploads', sanitizedFileName)
    };
  } catch (error) {
    console.error('Failed to save uploaded video');
    return {
      success: false,
      error: error.message
    };
  }
});

// Save diagram to project diagrams folder
ipcMain.handle('save-diagram', async (event, { projectName, stepId, title, diagramJson, diagramImage }) => {
  try {
    const diagramsDir = getProjectDiagramsDir(projectName);
    await ensureDir(diagramsDir);

    // Sanitize stepId for filename
    const sanitizedStepId = stepId.replace(/[<>:"|?*]/g, '_').replace(/[\\/:]/g, '-').trim();

    // Save JSON file
    const jsonFileName = `${sanitizedStepId}.json`;
    const jsonFilePath = path.join(diagramsDir, jsonFileName);
    await writeFile(jsonFilePath, diagramJson); // Parse and re-stringify to ensure proper format

    // Save PNG image - ALWAYS overwrite existing file
    const imageFileName = `${sanitizedStepId}.png`;
    const imageFilePath = path.join(diagramsDir, imageFileName);

    // Check if file exists and log for debugging
    const imageExists = fs.existsSync(imageFilePath);
    if (imageExists) {
    } else {
    }

    // Handle base64 image data
    const base64Data = diagramImage.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Write the file (this will overwrite if it exists)
    await writeFile(imageFilePath, buffer);

    // Verify file was written
    const stats = await stat(imageFilePath);

    // Add timestamp query param to image path to bust browser cache
    const cacheBuster = `?t=${Date.now()}`;

    return {
      success: true,
      jsonPath: path.join('diagrams', jsonFileName),
      imagePath: path.join('diagrams', imageFileName) + cacheBuster,
      absoluteJsonPath: jsonFilePath,
      absoluteImagePath: imageFilePath
    };
  } catch (error) {
    console.error('Failed to save diagram');
    return {
      success: false,
      error: error.message
    };
  }
});

// Delete project folder
ipcMain.handle('delete-project-folder', async (event, projectName) => {
  try {
    const projectDir = getProjectDir(projectName);
    
    if (fs.existsSync(projectDir)) {
      await remove(projectDir);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to delete project folder');
    throw new Error(`Failed to delete project folder: ${error.message}`);
  }
});

// Delete individual screenshot file
ipcMain.handle('delete-project-screenshot', async (event, projectName, fileName) => {
  try {
    const screenshotsDir = getProjectScreenshotsDir(projectName);
    const safeFileName = sanitizeProjectFileName(fileName, 'screenshot.png');
    const filePath = path.join(screenshotsDir, safeFileName);
    
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    
    console.warn('Screenshot file not found');
    return false;
  } catch (error) {
    console.error('Failed to delete screenshot file');
    throw new Error(`Failed to delete screenshot file: ${error.message}`);
  }
});

// Delete individual diagram file
ipcMain.handle('delete-diagram-file', async (event, projectName, fileName) => {
  try {
    const diagramsDir = getProjectDiagramsDir(projectName);
    const safeFileName = sanitizeProjectFileName(fileName, 'diagram');
    const filePath = path.join(diagramsDir, safeFileName);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }

    console.warn('Diagram file not found');
    return false;
  } catch (error) {
    console.error('Failed to delete diagram file');
    throw new Error(`Failed to delete diagram file: ${error.message}`);
  }
});

// Delete project files (recordings, screenshots, diagrams) for retake
ipcMain.handle('delete-project-files', async (event, projectName) => {
  try {
    const projectDir = getProjectDir(projectName);
    const recordingsDir = path.join(projectDir, 'recordings');
    const screenshotsDir = getProjectScreenshotsDir(projectName);
    const diagramsDir = getProjectDiagramsDir(projectName);

    let deletedCount = 0;

    // Clear recordings directory
    if (fs.existsSync(recordingsDir)) {
      const files = await fs.promises.readdir(recordingsDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(recordingsDir, file));
        deletedCount++;
      }
    }

    // Clear screenshots directory
    if (fs.existsSync(screenshotsDir)) {
      const files = await fs.promises.readdir(screenshotsDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(screenshotsDir, file));
        deletedCount++;
      }
    }

    // Clear diagrams directory
    if (fs.existsSync(diagramsDir)) {
      const files = await fs.promises.readdir(diagramsDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(diagramsDir, file));
        deletedCount++;
      }
    }

    return { success: true, deletedCount };
  } catch (error) {
    console.error('Failed to delete project files');
    throw new Error(`Failed to delete project files: ${error.message}`);
  }
});

// Get project file path for serving
ipcMain.handle('get-project-file-path', async (event, projectName, relativePath) => {
  try {
    const projectDir = getProjectDir(projectName);
    const fullPath = path.join(projectDir, relativePath);
    
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get project file path');
    return null;
  }
});

// SECURITY: Path allowlist helpers for file read/write operations
const selectedBackupDirectories = new Set();
const selectedImportFiles = new Set();

function normalizePathForCompare(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(filePath, parentDir) {
  const normalizedPath = normalizePathForCompare(filePath);
  const normalizedDir = normalizePathForCompare(parentDir);
  if (!normalizedPath || !normalizedDir) return false;
  return normalizedPath === normalizedDir || normalizedPath.startsWith(normalizedDir + path.sep);
}

function getAllowedReadDirs() {
  const userDataPath = app.getPath('userData');
  return [
    path.join(os.homedir(), 'Documents', 'Docfai Projects'),
    path.join(userDataPath, 'recordings'),
    path.join(userDataPath, 'temp'),
    path.join(userDataPath, 'storage'),
    userDataPath,
  ];
}

function isAllowedReadPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return getAllowedReadDirs().some(dir => isPathInside(filePath, dir));
}

function getRelativePathSegments(filePath, parentDir) {
  if (!isPathInside(filePath, parentDir)) return [];
  const relativePath = path.relative(path.resolve(parentDir), path.resolve(filePath));
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return [];
  return relativePath.split(path.sep).filter(Boolean);
}

function isProjectVersionsDir(dirPath) {
  const segments = getRelativePathSegments(dirPath, getProjectsDir());
  return segments.length === 2 && segments[1] === 'versions';
}

function isProjectVersionFile(filePath) {
  const segments = getRelativePathSegments(filePath, getProjectsDir());
  return segments.length === 3 && segments[1] === 'versions' && path.extname(segments[2]).toLowerCase() === '.docfai';
}

function isSelectedBackupPath(filePath) {
  return Array.from(selectedBackupDirectories).some(dir => isPathInside(filePath, dir));
}

function isSelectedImportFile(filePath) {
  const normalizedPath = normalizePathForCompare(filePath);
  return !!normalizedPath && selectedImportFiles.has(normalizedPath);
}

function isAllowedBackupWritePath(filePath) {
  return isProjectVersionFile(filePath) || isSelectedBackupPath(filePath);
}

function isAllowedBackupReadPath(filePath) {
  return isAllowedReadPath(filePath) || isSelectedBackupPath(filePath) || isSelectedImportFile(filePath);
}

function isAllowedShowInFolderPath(filePath) {
  return isPathInside(filePath, getProjectsDir()) || isSelectedBackupPath(filePath);
}

// Read text file (for JSON files)
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    if (!isAllowedReadPath(filePath)) {
      console.warn('read-file: path outside allowed directories');
      return null;
    }
    if (!fs.existsSync(filePath)) {
      console.warn('File not found');
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Failed to read file');
    return null;
  }
});

// Path and directory utilities for secure file access
ipcMain.handle('get-documents-path', () => {
  return app.getPath('documents');
});

ipcMain.handle('get-projects-directory', () => {
  return getProjectsDir();
});

ipcMain.handle('get-project-screenshots-directory', (event, projectName) => {
  return getProjectScreenshotsDir(projectName);
});

ipcMain.handle('get-project-uploads-directory', (event, projectName) => {
  return getProjectUploadsDir(projectName);
});

ipcMain.handle('get-project-diagrams-directory', (event, projectName) => {
  return getProjectDiagramsDir(projectName);
});

ipcMain.handle('list-project-files', async (event, projectName, subDirectory = '') => {
  try {
    const projectDir = getProjectDir(projectName);
    const targetDir = subDirectory ? path.join(projectDir, subDirectory) : projectDir;

    if (!isPathInside(targetDir, projectDir)) {
      return [];
    }
    
    if (!fs.existsSync(targetDir)) {
      return [];
    }
    
    const files = await fs.promises.readdir(targetDir, { withFileTypes: true });
    return files.map(file => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      path: path.join(subDirectory, file.name)
    }));
  } catch (error) {
    console.error('Failed to list project files');
    return [];
  }
});

ipcMain.handle('get-absolute-screenshot-path', async (event, projectName, fileName) => {
  try {
    const screenshotsDir = getProjectScreenshotsDir(projectName);
    const safeFileName = sanitizeProjectFileName(fileName, 'screenshot.png');
    const absolutePath = path.join(screenshotsDir, safeFileName);
    
    // Verify file exists before returning path
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get absolute screenshot path');
    return null;
  }
});

// Window controls
ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// OAuth and encryption handlers
ipcMain.handle('encrypt-data', async (event, data) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system');
    }
    const buffer = safeStorage.encryptString(data);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Failed to encrypt data');
    throw error;
  }
});

ipcMain.handle('decrypt-data', async (event, encryptedData) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system');
    }
    const buffer = Buffer.from(encryptedData, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    console.error('Failed to decrypt data');
    throw error;
  }
});

// Open external URL
// Security: Validate URLs before opening to prevent malicious protocol execution
// Strict host allowlist for renderer-requested external URL opens. A
// compromised renderer cannot pass an arbitrary phishing URL to the OS
// browser via this IPC channel — only hosts in this set are accepted.
// Keep this list MINIMAL and conscious; every entry is an attack surface.
const ALLOWED_EXTERNAL_HOSTS = new Set([
  // Project home and issue tracker
  'github.com',
]);

ipcMain.handle('open-external-url', async (event, url) => {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:') {
      console.error('Security: Blocked non-HTTPS external URL open');
      return { success: false, error: 'Only HTTPS URLs are allowed' };
    }

    if (!ALLOWED_EXTERNAL_HOSTS.has(parsedUrl.hostname)) {
      console.error('Security: Blocked external URL with non-allowlisted host');
      return { success: false, error: 'Host not in external-URL allowlist' };
    }

    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL');
    return { success: false, error: error.message };
  }
});


// Backup and Export IPC Handlers

// Show item in folder (for opening backup locations)
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    if (!isAllowedShowInFolderPath(filePath)) {
      console.warn('show-item-in-folder: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to show item in folder');
    return { success: false, error: error.message };
  }
});

// Select directory for backup destination
ipcMain.handle('select-backup-directory', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Backup Destination'
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const selectedPath = path.resolve(result.filePaths[0]);
    selectedBackupDirectories.add(normalizePathForCompare(selectedPath));
    return { success: true, path: selectedPath };
  } catch (error) {
    console.error('Failed to select backup directory');
    return { success: false, error: error.message };
  }
});

// Select file for import
ipcMain.handle('select-import-file', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Select Project File to Import',
      filters: [
        { name: 'DocFAI Project Files', extensions: ['docfai'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const selectedPath = path.resolve(result.filePaths[0]);
    selectedImportFiles.add(normalizePathForCompare(selectedPath));
    return { success: true, path: selectedPath };
  } catch (error) {
    console.error('Failed to select import file');
    return { success: false, error: error.message };
  }
});

// Read file for import
ipcMain.handle('read-import-file', async (event, filePath) => {
  try {
    // SECURITY: Import files must be .docfai archives selected via dialog
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.docfai') {
      console.warn('read-import-file: rejected non-.docfai extension');
      return { success: false, error: 'Only .docfai files can be imported' };
    }
    if (!isSelectedImportFile(filePath) && !isProjectVersionFile(filePath)) {
      console.warn('read-import-file: path was not selected via dialog and is not a project version file');
      return { success: false, error: 'Path not permitted' };
    }
    const fileBuffer = await readFile(filePath);
    return { success: true, data: fileBuffer };
  } catch (error) {
    console.error('Failed to read import file');
    return { success: false, error: error.message };
  }
});

// Read file as base64 string
ipcMain.handle('read-file-as-base64', async (event, filePath) => {
  try {
    // SECURITY: Only allow reading from known project/app directories
    if (!isAllowedReadPath(filePath)) {
      console.warn('read-file-as-base64: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    const fileBuffer = await readFile(filePath);
    const base64String = fileBuffer.toString('base64');
    return { success: true, data: base64String };
  } catch (error) {
    console.error('Failed to read file as base64');
    return { success: false, error: error.message };
  }
});

// Write backup file
ipcMain.handle('write-backup-file', async (event, filePath, data) => {
  try {
    // SECURITY: Allow writes only to user-selected backup dirs or project versions dirs.
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    if (!isAllowedBackupWritePath(filePath)) {
      console.warn('write-backup-file: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    
    // Write file
    await writeFile(filePath, data);
    
    // Get file stats
    const stats = await stat(filePath);
    
    return { 
      success: true, 
      path: filePath,
      size: stats.size
    };
  } catch (error) {
    console.error('Failed to write backup file');
    return { success: false, error: error.message };
  }
});

// Get directory size (for backup size calculations)
ipcMain.handle('get-directory-size', async (event, dirPath) => {
  try {
    if (!isPathInside(dirPath, getProjectsDir()) && !isSelectedBackupPath(dirPath)) {
      console.warn('get-directory-size: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    const getSize = async (dir) => {
      let size = 0;
      const files = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          size += await getSize(filePath);
        } else {
          const stats = await stat(filePath);
          size += stats.size;
        }
      }
      
      return size;
    };
    
    const size = await getSize(dirPath);
    return { success: true, size };
  } catch (error) {
    console.error('Failed to get directory size');
    return { success: false, error: error.message };
  }
});

// Check if path exists
ipcMain.handle('path-exists', async (event, filePath) => {
  try {
    if (!isAllowedBackupReadPath(filePath)) {
      console.warn('path-exists: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    await stat(filePath);
    return { success: true, exists: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true, exists: false };
    }
    console.error('Failed to check path existence');
    return { success: false, error: error.message };
  }
});

// Get available disk space
ipcMain.handle('get-disk-space', async (event, dirPath) => {
  try {
    if (!isPathInside(dirPath, getProjectsDir()) && !isSelectedBackupPath(dirPath)) {
      console.warn('get-disk-space: path outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    const stats = await fs.promises.statfs ? fs.promises.statfs(dirPath) : null;
    if (stats) {
      return {
        success: true,
        free: stats.bavail * stats.bsize,
        total: stats.blocks * stats.bsize
      };
    } else {
      // Fallback for systems without statfs
      return {
        success: true,
        free: -1, // Unknown
        total: -1 // Unknown
      };
    }
  } catch (error) {
    console.error('Failed to get disk space');
    return { success: false, error: error.message };
  }
});

// Create backup directory structure
ipcMain.handle('create-backup-directory', async (event, basePath, projectName) => {
  try {
    if (!isSelectedBackupPath(basePath)) {
      console.warn('create-backup-directory: base path outside selected backup directories');
      return { success: false, error: 'Path not permitted' };
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(basePath, `${projectName}_backup_${timestamp}`);
    
    await ensureDir(backupDir);
    
    return { success: true, path: backupDir };
  } catch (error) {
    console.error('Failed to create backup directory');
    return { success: false, error: error.message };
  }
});

// Copy file with progress
ipcMain.handle('copy-file-with-progress', async (event, sourcePath, destPath) => {
  try {
    if (!isAllowedBackupReadPath(sourcePath) || !isAllowedBackupWritePath(destPath)) {
      console.warn('copy-file-with-progress: source or destination outside allowed directories');
      return { success: false, error: 'Path not permitted' };
    }
    const sourceStats = await stat(sourcePath);
    const totalSize = sourceStats.size;
    let copiedSize = 0;
    
    // Ensure destination directory exists
    await ensureDir(path.dirname(destPath));
    
    // Create read and write streams
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(destPath);
    
    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        copiedSize += chunk.length;
        const progress = Math.round((copiedSize / totalSize) * 100);
        
        // Send progress update to renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('backup-progress', {
            type: 'file-copy',
            progress,
            file: path.basename(sourcePath),
            copiedSize,
            totalSize
          });
        }
      });
      
      readStream.on('error', reject);
      writeStream.on('error', reject);
      
      writeStream.on('finish', () => {
        resolve({ success: true, size: copiedSize });
      });
      
      readStream.pipe(writeStream);
    });
  } catch (error) {
    console.error('Failed to copy file with progress');
    return { success: false, error: error.message };
  }
});

// Get system information for backup context
ipcMain.handle('get-system-info', async (event) => {
  try {
    return {
      success: true,
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      appVersion: app.getVersion(),
      userDataPath: app.getPath('userData'),
      documentsPath: app.getPath('documents'),
      tempPath: app.getPath('temp')
    };
  } catch (error) {
    console.error('Failed to get system info');
    return { success: false, error: error.message };
  }
});

// ========== Version Management IPC Handlers ==========

// List version files in a project's versions directory
ipcMain.handle('list-version-files', async (event, projectVersionsDir) => {
  try {
    if (!isProjectVersionsDir(projectVersionsDir)) {
      console.warn('list-version-files: path is not a project versions directory');
      return { success: false, error: 'Path not permitted' };
    }
    await ensureDir(projectVersionsDir);
    const files = await fs.promises.readdir(projectVersionsDir, { withFileTypes: true });
    const versionFiles = [];
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.docfai')) {
        const filePath = path.join(projectVersionsDir, file.name);
        const stats = await stat(filePath);
        versionFiles.push({
          name: file.name,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }
    return { success: true, files: versionFiles };
  } catch (error) {
    console.error('Failed to list version files');
    return { success: false, error: error.message };
  }
});

// Delete a specific version file from disk
ipcMain.handle('delete-version-file', async (event, filePath) => {
  try {
    if (!isProjectVersionFile(filePath)) {
      console.warn('delete-version-file: path is not a project version file');
      return { success: false, error: 'Path not permitted' };
    }
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true }; // Already deleted
    }
    console.error('Failed to delete version file');
    return { success: false, error: error.message };
  }
});

// Move/rename a directory (used to preserve versions folder during restore)
ipcMain.handle('move-directory', async (event, sourcePath, destPath) => {
  try {
    if (!isProjectVersionsDir(sourcePath) || !isProjectVersionsDir(destPath)) {
      console.warn('move-directory: source or destination is not a project versions directory');
      return { success: false, error: 'Path not permitted' };
    }
    if (!fs.existsSync(sourcePath)) {
      return { success: true }; // Nothing to move
    }
    // Ensure parent of destination exists
    await ensureDir(path.dirname(destPath));
    await fs.promises.rename(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    // rename fails across devices; fall back to copy + remove
    try {
      await pkg.copy(sourcePath, destPath);
      await remove(sourcePath);
      return { success: true };
    } catch (fallbackError) {
      console.error('Failed to move directory');
      return { success: false, error: fallbackError.message };
    }
  }
});

// Show version file in system file explorer
ipcMain.handle('show-version-in-folder', async (event, filePath) => {
  try {
    if (!isProjectVersionFile(filePath)) {
      console.warn('show-version-in-folder: path is not a project version file');
      return { success: false, error: 'Path not permitted' };
    }
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to show version in folder');
    return { success: false, error: error.message };
  }
});

// Show message box for debugging
ipcMain.handle('show-message-box', async (event, options) => {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options.type || 'info',
      title: options.title || 'Debug Alert',
      message: options.message || '',
      buttons: options.buttons || ['OK'],
      defaultId: 0
    });
    return { success: true, response: result.response };
  } catch (error) {
    console.error('[Debug Alert] Failed to show message box');
    return { success: false, error: error.message };
  }
});

// Log debug messages from renderer process
ipcMain.handle('log-debug', async (event, message) => {
  try {
    return { success: true };
  } catch (error) {
    console.error('Failed to log debug message');
    return { success: false, error: error.message };
  }
});

// Translation handlers using Python + Argos Translate
import { PythonShell } from 'python-shell';

// Get Python executable path - checks on-demand module first, then bundled fallback
function getBundledPythonPath() {
  if (app.isPackaged) {
    // Production: Check on-demand downloaded module first
    const onDemandPython = translationModuleManager.getPythonPath();
    if (fs.existsSync(onDemandPython)) {
      return onDemandPython;
    }
    // Fallback: Python bundled in resources (backward compatibility)
    return path.join(process.resourcesPath, 'python', 'runtime', 'python.exe');
  } else {
    // Development: Python in project folder
    const bundledPython = path.join(__dirname, '../python/runtime/python.exe');
    if (fs.existsSync(bundledPython)) {
      return bundledPython;
    }
    // Fallback to system Python
    return 'python';
  }
}

// Get translate.py script path - checks on-demand module first, then bundled fallback
function getTranslateScriptPath() {
  if (app.isPackaged) {
    const onDemandScript = translationModuleManager.getTranslateScriptPath();
    if (fs.existsSync(onDemandScript)) {
      return onDemandScript;
    }
    return path.join(process.resourcesPath, 'python', 'translate.py');
  }
  return path.join(__dirname, '../python/translate.py');
}

ipcMain.handle('translate-text', async (event, params) => {
  try {
    const { text, targetLang, sourceLang } = params;

    if (!text || text.trim().length === 0) {
      return { translatedText: text };
    }

    const pythonPath = getBundledPythonPath();
    const pythonScript = getTranslateScriptPath();

    // Check if translation module is available
    if (!fs.existsSync(pythonPath)) {
      return { error: 'TRANSLATION_MODULE_NOT_INSTALLED', translatedText: params.text };
    }

    const args = ['translate', text, targetLang];
    if (sourceLang) {
      args.push(sourceLang);
    }


    const results = await PythonShell.run(pythonScript, {
      pythonPath,
      args
    });

    const result = JSON.parse(results[0]);

    return result;
  } catch (error) {
    console.error('[Translation] Failed');
    return { error: error.message, translatedText: params.text };
  }
});

ipcMain.handle('translate-batch', async (event, params) => {
  try {
    const { texts, targetLang, sourceLang } = params;

    if (!texts || texts.length === 0) {
      return { translatedTexts: [] };
    }

    const pythonPath = getBundledPythonPath();
    const pythonScript = getTranslateScriptPath();

    // Check if translation module is available
    if (!fs.existsSync(pythonPath)) {
      return { error: 'TRANSLATION_MODULE_NOT_INSTALLED', translatedTexts: params.texts };
    }

    const args = ['translate_batch', JSON.stringify(texts), targetLang];
    if (sourceLang) {
      args.push(sourceLang);
    }


    const results = await PythonShell.run(pythonScript, {
      pythonPath,
      args
    });

    const result = JSON.parse(results[0]);

    return result;
  } catch (error) {
    console.error('[Translation] Batch failed');
    return { error: error.message, translatedTexts: params.texts };
  }
});

// ============================================================================
// TRANSLATION MODULE IPC Handlers
// ============================================================================

ipcMain.handle('translation-module:get-status', async () => {
  return translationModuleManager.getStatus();
});

ipcMain.handle('translation-module:start-download', async () => {
  translationModuleManager.setMainWindow(mainWindow);
  return translationModuleManager.download();
});

ipcMain.handle('translation-module:cancel-download', async () => {
  translationModuleManager.cancelDownload();
});

ipcMain.handle('translation-module:uninstall', async () => {
  return translationModuleManager.uninstall();
});

ipcMain.handle('translation-module:check-disk-space', async () => {
  return translationModuleManager.checkDiskSpace();
});

// ============================================================================
// AUTO-UPDATE IPC Handlers
// ============================================================================

/**
 * Manual update check
 * Called when user clicks "Check for Updates" button
 */
ipcMain.handle('check-for-updates', async () => {
  if (isMicrosoftStoreVersion()) {
    return {
      available: false,
      method: 'store',
      message: 'Updates are managed by Microsoft Store'
    };
  }

  if (!isAutoUpdateConfigured()) {
    return {
      available: false,
      currentVersion: app.getVersion(),
      message: 'Auto-update is not configured for this build'
    };
  }

  try {
    log.info('[Auto-Update IPC] Manual update check requested');
    const result = await autoUpdater.checkForUpdates();

    if (result && result.updateInfo) {
      const currentVersion = app.getVersion();
      const latestVersion = result.updateInfo.version;

      return {
        available: latestVersion !== currentVersion,
        currentVersion: currentVersion,
        latestVersion: latestVersion,
        method: 'electron-updater'
      };
    }

    return {
      available: false,
      currentVersion: app.getVersion(),
      method: 'electron-updater'
    };
  } catch (error) {
    log.error('[Auto-Update IPC] Error checking for updates:', error);
    return {
      available: false,
      error: error.message,
      currentVersion: app.getVersion()
    };
  }
});

/**
 * Install update and restart
 * Called when user clicks "Restart to Update" button
 */
ipcMain.handle('install-update', async () => {
  if (isMicrosoftStoreVersion()) {
    return {
      success: false,
      message: 'Store apps update via Windows Update'
    };
  }

  try {
    log.info('[Auto-Update IPC] User requested update installation');
    // quitAndInstall(isSilent, isForceRunAfter)
    // false = show restart dialog, true = restart immediately after install
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    log.error('[Auto-Update IPC] Error installing update:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

/**
 * Get current app version
 * Used to display version in About dialog or settings
 */
ipcMain.handle('get-app-version', () => {
  return {
    version: app.getVersion(),
    isStoreVersion: isMicrosoftStoreVersion()
  };
});

/**
 * Open app data folder in file explorer
 */
ipcMain.handle('open-app-data-folder', async () => {
  try {
    const userDataPath = app.getPath('userData');
    await shell.openPath(userDataPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to open app data folder');
    return { success: false, error: error.message };
  }
});

/**
 * Get renderer error logs from the renderer process
 */
ipcMain.handle('get-renderer-error-logs', async () => {
  // This will be called from renderer with the logs
  return { success: true };
});

/**
 * Export error logs to file
 * Collects errors from both main and renderer processes
 */
ipcMain.handle('export-error-logs', async (event, rendererLogs) => {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const defaultFileName = `docfai-error-logs-${timestamp}.txt`;

    // Show save dialog to let user choose where to save
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Error Logs',
      defaultPath: path.join(app.getPath('desktop'), defaultFileName),
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    // If user canceled the save dialog
    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');

    // Try to read electron-log files (error level only)
    let mainProcessErrors = 'No main process error logs found.';
    try {
      const logFiles = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
      const mainLogFile = logFiles.find(f => f.startsWith('main.log'));

      if (mainLogFile) {
        const mainLogPath = path.join(logDir, mainLogFile);
        const mainLogContent = fs.readFileSync(mainLogPath, 'utf8');

        // Filter for error lines only
        const errorLines = mainLogContent
          .split('\n')
          .filter(line => line.includes('[error]') || line.includes('ERROR'))
          .slice(-50); // Last 50 errors

        if (errorLines.length > 0) {
          mainProcessErrors = errorLines.join('\n');
        }
      }
    } catch (error) {
      mainProcessErrors = `Failed to read main process logs: ${error.message}`;
    }

    // Collect error log content
    const logContent = [
      '='.repeat(80),
      'Docfai Error Logs',
      '='.repeat(80),
      `Generated: ${new Date().toLocaleString()}`,
      `App Version: ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Electron: ${process.versions.electron}`,
      `Chrome: ${process.versions.chrome}`,
      `Node: ${process.versions.node}`,
      '='.repeat(80),
      '',
      '='.repeat(80),
      'System Information',
      '='.repeat(80),
      `User Data Path: ${userDataPath}`,
      `Log Directory: ${logDir}`,
      '',
      '='.repeat(80),
      'Renderer Process Errors (React/UI)',
      '='.repeat(80),
      rendererLogs || 'No renderer errors captured.',
      '',
      '='.repeat(80),
      'Main Process Errors (Electron)',
      '='.repeat(80),
      mainProcessErrors,
      '',
    ].join('\n');

    // Write log file to user-chosen location
    fs.writeFileSync(filePath, logContent, 'utf8');

    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to export error logs');
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Storage Service IPC Handlers - electron-store based persistent storage
// Replaces localStorage to resolve QuotaExceededError issues
// ============================================================================

/**
 * Get item from storage
 */
ipcMain.handle('storage-get-item', async (event, key) => {
  try {
    const value = storageService.getItem(key);
    return { success: true, value };
  } catch (error) {
    console.error('[Storage IPC] Error getting item');
    return { success: false, error: error.message, value: null };
  }
});

/**
 * Set item in storage
 */
ipcMain.handle('storage-set-item', async (event, key, value) => {
  try {
    storageService.setItem(key, value);
    return { success: true };
  } catch (error) {
    console.error('[Storage IPC] Error setting item');
    return { success: false, error: error.message };
  }
});

/**
 * Remove item from storage
 */
ipcMain.handle('storage-remove-item', async (event, key) => {
  try {
    storageService.removeItem(key);
    return { success: true };
  } catch (error) {
    console.error('[Storage IPC] Error removing item');
    return { success: false, error: error.message };
  }
});

/**
 * Clear all storage
 */
ipcMain.handle('storage-clear', async () => {
  try {
    storageService.clear();
    return { success: true };
  } catch (error) {
    console.error('[Storage IPC] Error clearing storage');
    return { success: false, error: error.message };
  }
});

/**
 * Get all keys in storage
 */
ipcMain.handle('storage-keys', async () => {
  try {
    const keys = storageService.keys();
    return { success: true, keys };
  } catch (error) {
    console.error('[Storage IPC] Error getting keys');
    return { success: false, keys: [], error: error.message };
  }
});

/**
 * Get storage statistics
 */
ipcMain.handle('storage-get-stats', async () => {
  try {
    const stats = storageService.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('[Storage IPC] Error getting stats');
    return { success: false, error: error.message };
  }
});

/**
 * Migrate data from localStorage to electron-store
 */
ipcMain.handle('storage-migrate-from-localstorage', async (event, localStorageData) => {
  try {
    const result = storageService.migrateFromLocalStorage(localStorageData);
    return { success: true, migrationResult: result };
  } catch (error) {
    console.error('[Storage IPC] Migration error');
    return { success: false, error: error.message };
  }
});

/**
 * Check if storage has data
 */
ipcMain.handle('storage-has-data', async () => {
  try {
    const hasData = storageService.hasData();
    return { success: true, hasData };
  } catch (error) {
    console.error('[Storage IPC] Error checking for data');
    return { success: false, hasData: false, error: error.message };
  }
});


/**
 * Analyze legacy data in storage
 */
ipcMain.handle('storage-analyze-legacy-data', async () => {
  try {
    const analysis = storageService.analyzeLegacyData();
    return { success: true, analysis };
  } catch (error) {
    console.error('[Storage IPC] Error analyzing legacy data');
    return { success: false, error: error.message };
  }
});

/**
 * Clean up legacy data from storage
 */
ipcMain.handle('storage-cleanup-legacy-data', async () => {
  try {
    const result = storageService.cleanupLegacyData();
    return { success: true, cleanupResult: result };
  } catch (error) {
    console.error('[Storage IPC] Cleanup error');
    return { success: false, error: error.message };
  }
});

function navigateMainWindowToPath(routePath) {
  if (!mainWindow || !mainWindow.webContents) {
    return false;
  }

  const allowedRoutes = new Set(['/account', '/dashboard']);
  const normalizedPath = typeof routePath === 'string' && routePath.startsWith('/')
    ? routePath
    : `/${routePath || ''}`;

  if (!allowedRoutes.has(normalizedPath)) {
    return false;
  }

  mainWindow.webContents.executeJavaScript(
    `window.location.hash = ${JSON.stringify(`#${normalizedPath}`)};`
  ).catch(() => {
    console.error('Failed to navigate main window');
  });

  return true;
}

ipcMain.handle('navigate-to-path', async (_event, routePath) => {
  const success = navigateMainWindowToPath(routePath);
  return success ? { success: true } : { success: false, error: 'Unsupported navigation path' };
});

// Prevent navigation away from the app
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });
});

// Clean up capture services on app quit
app.on('before-quit', () => {
  // Cleanup auto-capture service
  if (autoCaptureService) {
    try {
      autoCaptureService.cleanup();
    } catch (error) {
      console.error('Error cleaning up autoCaptureService on quit');
    }
    autoCaptureService = null;
  }

  // Cleanup hotkeyCapture service
  if (hotkeyCapture) {
    try {
      if (hotkeyCapture.isRunning()) {
        hotkeyCapture.stop();
      }
      hotkeyCapture.cleanup();
    } catch (error) {
      console.error('Error cleaning up hotkeyCapture on quit');
    }
    hotkeyCapture = null;
  }
});
