const { contextBridge, ipcRenderer } = require('electron');

// SECURITY: All debug logs removed to prevent exposure of sensitive information
// Do not log process.argv as it contains environment variables and API keys

// Extract environment variables from process.argv
const envVars = {};
process.argv.forEach(arg => {
  if (arg.startsWith('--env-')) {
    const [key, value] = arg.substring(6).split('=');
    envVars[key] = value;
  }
});

// Create environment object for renderer (no API keys: the app has no backend)
const electronEnvObject = {
  NODE_ENV: envVars.NODE_ENV || process.env.NODE_ENV || 'production'
};

const ALLOWED_GENERIC_LISTEN_CHANNELS = new Set([]);

const ALLOWED_GENERIC_SEND_CHANNELS = new Set([]);
const genericListenerRegistry = new Map();

function assertAllowedChannel(channel, allowedChannels, apiName) {
  if (typeof channel !== 'string' || !allowedChannels.has(channel)) {
    throw new Error(`${apiName}: IPC channel "${channel}" is not allowed`);
  }
}

function trackGenericListener(channel, callback, wrappedCallback) {
  if (!genericListenerRegistry.has(channel)) {
    genericListenerRegistry.set(channel, new Map());
  }
  genericListenerRegistry.get(channel).set(callback, wrappedCallback);
}

function removeTrackedGenericListener(channel, callback) {
  const channelListeners = genericListenerRegistry.get(channel);
  const wrappedCallback = channelListeners?.get(callback);
  if (wrappedCallback) {
    ipcRenderer.removeListener(channel, wrappedCallback);
    channelListeners.delete(callback);
    if (channelListeners.size === 0) {
      genericListenerRegistry.delete(channel);
    }
    return;
  }

  ipcRenderer.removeListener(channel, callback);
}



// Expose environment variables to renderer process
try {
  contextBridge.exposeInMainWorld('electronEnv', electronEnvObject);
  
  // Also expose electronTest for verification
  contextBridge.exposeInMainWorld('electronTest', {
    test: () => 'Electron preload working!',
    getEnv: () => electronEnvObject
  });
} catch (error) {
  console.error('Error exposing objects via contextBridge:', error);
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Screen recording APIs
  getSources: () => ipcRenderer.invoke('get-sources'),
  getRetakeSources: () => ipcRenderer.invoke('get-retake-sources'),
  captureSourceScreenshot: (sourceId) => ipcRenderer.invoke('capture-source-screenshot', sourceId),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  
  // Global recording APIs
  startGlobalRecording: (source) => ipcRenderer.invoke('start-global-recording', source),
  stopGlobalRecording: () => ipcRenderer.invoke('stop-global-recording'),
  captureDesktopScreenshot: () => ipcRenderer.invoke('capture-desktop-screenshot'),
  getGlobalRecordingStatus: () => ipcRenderer.invoke('get-global-recording-status'),
  createMediaStream: (sourceId) => ipcRenderer.invoke('create-media-stream', sourceId),
  
  // Screenshot capture APIs
  startScreenshotCapture: (source) => ipcRenderer.invoke('start-screenshot-capture', source),
  stopScreenshotCapture: () => ipcRenderer.invoke('stop-screenshot-capture'),

  // Auto-capture APIs (click detection + UIAutomation)
  startAutoCapture: (config) => ipcRenderer.invoke('start-auto-capture', config),
  stopAutoCapture: () => ipcRenderer.invoke('stop-auto-capture'),
  getAutoCaptureStatus: () => ipcRenderer.invoke('get-auto-capture-status'),
  onAutoCaptureClickDetected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('auto-capture-click-detected', handler);
    return () => ipcRenderer.removeListener('auto-capture-click-detected', handler);
  },
  onAutoCaptureError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('auto-capture-error', handler);
    return () => ipcRenderer.removeListener('auto-capture-error', handler);
  },

  // Store-Compliant Hotkey Configuration APIs
  getHotkeyConfig: () => ipcRenderer.invoke('get-hotkey-config'),
  saveHotkeyConfig: (config) => ipcRenderer.invoke('save-hotkey-config', config),
  updateHotkeys: (primary, secondary) => ipcRenderer.invoke('update-hotkeys', primary, secondary),

  // File operations
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  saveVideoRecording: (videoBlob, fileName) => ipcRenderer.invoke('save-video-recording', videoBlob, fileName),
  saveProjectVideoRecording: (projectName, videoBlob, fileName) => ipcRenderer.invoke('save-project-video-recording', projectName, videoBlob, fileName),
  exportFile: (data) => ipcRenderer.invoke('export-file', data),
  generateFileContent: (data) => ipcRenderer.invoke('generate-file-content', data),
  exportVideo: (data) => ipcRenderer.invoke('export-video', data),
  previewDocumentation: (data) => ipcRenderer.invoke('preview-documentation', data),
  
  // Project folder operations
  createProjectFolder: (projectName) => ipcRenderer.invoke('create-project-folder', projectName),
  saveProjectRecording: (projectName, fileName, videoData) => ipcRenderer.invoke('save-project-recording', projectName, fileName, videoData),
  saveProjectScreenshot: (projectName, fileName, screenshotData) => ipcRenderer.invoke('save-project-screenshot', projectName, fileName, screenshotData),
  saveProjectExport: (projectName, fileName, fileData, fileType) => ipcRenderer.invoke('save-project-export', projectName, fileName, fileData, fileType),
  openExportedFile: (filePath) => ipcRenderer.invoke('open-exported-file', filePath),
  saveProjectUpload: (projectName, fileName, videoData) => ipcRenderer.invoke('save-project-upload', projectName, fileName, videoData),
  saveDiagram: (data) => ipcRenderer.invoke('save-diagram', data),
  deleteProjectScreenshot: (projectName, fileName) => ipcRenderer.invoke('delete-project-screenshot', projectName, fileName),
  deleteDiagramFile: (projectName, fileName) => ipcRenderer.invoke('delete-diagram-file', projectName, fileName),
  deleteProjectFolder: (projectName) => ipcRenderer.invoke('delete-project-folder', projectName),
  deleteProjectFiles: (projectName) => ipcRenderer.invoke('delete-project-files', projectName),
  getProjectFilePath: (projectName, relativePath) => ipcRenderer.invoke('get-project-file-path', projectName, relativePath),
  getProjectUploadsDirectory: (projectName) => ipcRenderer.invoke('get-project-uploads-directory', projectName),
  getProjectDiagramsDirectory: (projectName) => ipcRenderer.invoke('get-project-diagrams-directory', projectName),
  listProjectFiles: (projectName, subDirectory) => ipcRenderer.invoke('list-project-files', projectName, subDirectory),
  
  // Video processing APIs
  extractVideoFrames: (videoPath, options) => ipcRenderer.invoke('extract-video-frames', videoPath, options),
  generateVideoThumbnail: (projectName, videoClipPath) => ipcRenderer.invoke('generate-video-thumbnail', projectName, videoClipPath),
  extractStepsFromBookmarks: (videoPath, projectName, bookmarks) => ipcRenderer.invoke('extract-steps-from-bookmarks', videoPath, projectName, bookmarks),
  onSceneDetectionProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scene-detection-progress', handler);
    return () => ipcRenderer.removeListener('scene-detection-progress', handler);
  },
  saveTemporaryFile: (buffer, filename) => ipcRenderer.invoke('save-temporary-file', buffer, filename),
  
  // File URL handling
  getFileUrl: (filePath) => ipcRenderer.invoke('get-file-url', filePath),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  // Platform info
  platform: process.platform,
  
  // Secure path utilities (replaces unsafe process.cwd usage)
  getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
  getProjectsDirectory: () => ipcRenderer.invoke('get-projects-directory'),
  getProjectScreenshotsDirectory: (projectName) => ipcRenderer.invoke('get-project-screenshots-directory', projectName),
  getAbsoluteScreenshotPath: (projectName, fileName) => ipcRenderer.invoke('get-absolute-screenshot-path', projectName, fileName),
  
  // Event listeners
  onRecordingUpdate: (callback) => {
    ipcRenderer.on('recording-update', callback);
    return () => ipcRenderer.removeListener('recording-update', callback);
  },
  
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', callback);
    return () => ipcRenderer.removeListener('export-progress', callback);
  },
  
  onScreenshotCaptured: (callback) => {
    ipcRenderer.on('screenshot-captured', callback);
    return () => ipcRenderer.removeListener('screenshot-captured', callback);
  },
  
  // Video recording event listeners
  onVideoRecordingStarted: (callback) => {
    ipcRenderer.on('start-video-recording', callback);
    return () => ipcRenderer.removeListener('start-video-recording', callback);
  },
  
  onVideoRecordingStopped: (callback) => {
    ipcRenderer.on('stop-video-recording', callback);
    return () => ipcRenderer.removeListener('stop-video-recording', callback);
  },
  
  onCreateVideoStream: (callback) => {
    ipcRenderer.on('create-video-stream', callback);
    return () => ipcRenderer.removeListener('create-video-stream', callback);
  },
  
  onVideoRecordingError: (callback) => {
    ipcRenderer.on('video-recording-error', callback);
    return () => ipcRenderer.removeListener('video-recording-error', callback);
  },

  // Enhanced input capture listeners
  onMousePositionUpdate: (callback) => {
    ipcRenderer.on('mouse-position-update', callback);
    return () => ipcRenderer.removeListener('mouse-position-update', callback);
  },
  
  // REMOVED: onGlobalMouseClick - Microsoft Store compliance
  // Global mouse hooks violate Microsoft Store policies

  onNativeScreenshotReady: (callback) => {
    ipcRenderer.on('native-screenshot-ready', callback);
    return () => ipcRenderer.removeListener('native-screenshot-ready', callback);
  },

  // Store-Compliant Hotkey Capture Event Listeners
  onCaptureInstructions: (callback) => {
    ipcRenderer.on('capture-instructions', callback);
    return () => ipcRenderer.removeListener('capture-instructions', callback);
  },

  onScreenshotError: (callback) => {
    ipcRenderer.on('screenshot-error', callback);
    return () => ipcRenderer.removeListener('screenshot-error', callback);
  },

  onDebugLog: (callback) => {
    ipcRenderer.on('debug-log', callback);
    return () => ipcRenderer.removeListener('debug-log', callback);
  },

  // Bookmark event listener for video recording timeline markers
  onBookmarkCreated: (callback) => {
    ipcRenderer.on('bookmark-created', callback);
    return () => ipcRenderer.removeListener('bookmark-created', callback);
  },

  // External links and in-app navigation
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  navigateToPath: (path) => ipcRenderer.invoke('navigate-to-path', path),

  // Generic listener (only channels in ALLOWED_GENERIC_LISTEN_CHANNELS)
  on: (channel, callback) => {
    assertAllowedChannel(channel, ALLOWED_GENERIC_LISTEN_CHANNELS, 'on');
    const wrappedCallback = (_event, ...args) => callback(...args);
    trackGenericListener(channel, callback, wrappedCallback);
    ipcRenderer.on(channel, wrappedCallback);
    return () => removeTrackedGenericListener(channel, callback);
  },

  // Debug and messaging APIs
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  logDebug: (message) => ipcRenderer.invoke('log-debug', message),

  // Translation APIs (Argos Translate - Python)
  translateText: (params) => ipcRenderer.invoke('translate-text', params),
  translateBatch: (params) => ipcRenderer.invoke('translate-batch', params),

  // Translation Module Management (on-demand download)
  translationModuleStatus: () => ipcRenderer.invoke('translation-module:get-status'),
  translationModuleDownload: () => ipcRenderer.invoke('translation-module:start-download'),
  translationModuleCancelDownload: () => ipcRenderer.invoke('translation-module:cancel-download'),
  translationModuleUninstall: () => ipcRenderer.invoke('translation-module:uninstall'),
  translationModuleCheckDiskSpace: () => ipcRenderer.invoke('translation-module:check-disk-space'),
  onTranslationModuleProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('translation-module:download-progress', listener);
    return () => ipcRenderer.removeListener('translation-module:download-progress', listener);
  },
  onTranslationModuleComplete: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('translation-module:download-complete', listener);
    return () => ipcRenderer.removeListener('translation-module:download-complete', listener);
  },

  // Auto-Update APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateAvailable: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.removeListener('update:downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update:error', listener);
    return () => ipcRenderer.removeListener('update:error', listener);
  },

  // Encryption APIs for secure storage
  encryptData: (data) => ipcRenderer.invoke('encrypt-data', data),
  decryptData: (encryptedData) => ipcRenderer.invoke('decrypt-data', encryptedData),
  
  // IPC messaging with enhanced debugging
  sendMessage: (channel, data) => {
    assertAllowedChannel(channel, ALLOWED_GENERIC_SEND_CHANNELS, 'sendMessage');
    // SECURITY: Debug log removed to prevent data exposure
    ipcRenderer.send(channel, data);
  },
  
  onMessage: (channel, callback) => {
    assertAllowedChannel(channel, ALLOWED_GENERIC_LISTEN_CHANNELS, 'onMessage');
    // SECURITY: Debug logs removed to prevent data exposure
    const wrappedCallback = (_event, ...args) => {
      callback(_event, ...args);
    };
    trackGenericListener(channel, callback, wrappedCallback);
    ipcRenderer.on(channel, wrappedCallback);
    return () => {
      removeTrackedGenericListener(channel, callback);
    };
  },

  removeListener: (channel, callback) => {
    assertAllowedChannel(channel, ALLOWED_GENERIC_LISTEN_CHANNELS, 'removeListener');
    // SECURITY: Debug log removed
    removeTrackedGenericListener(channel, callback);
  },

  // General IPC messaging — SECURITY: channel allowlist prevents a compromised
  // renderer from invoking arbitrary IPC handlers by name.
  ipcInvoke: (channel, ...args) => {
    const ALLOWED_CHANNELS = [
      'get-project-file-path',
      'read-file',
      'save-project-screenshot',
      'storage-has-data',
      'storage-migrate-from-localstorage',
      'storage-keys',
      'storage-get-item',
      'storage-set-item',
      'storage-remove-item',
      'storage-clear',
      'storage-get-stats',
    ];
    if (!ALLOWED_CHANNELS.includes(channel)) {
      console.error(`ipcInvoke: blocked disallowed channel "${channel}"`);
      return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  // SECURITY: ipcSend, ipcOn, ipcOff, ipcOnce, ipcRemoveAllListeners removed —
  // unused in the renderer and exposed unrestricted IPC access.

  // App utilities
  openAppDataFolder: () => ipcRenderer.invoke('open-app-data-folder'),
  exportErrorLogs: (rendererLogs) => ipcRenderer.invoke('export-error-logs', rendererLogs),

  // Backup and Export APIs
  backup: {
    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
    selectBackupDirectory: () => ipcRenderer.invoke('select-backup-directory'),
    selectImportFile: () => ipcRenderer.invoke('select-import-file'),
    readImportFile: (filePath) => ipcRenderer.invoke('read-import-file', filePath),
    readFileAsBase64: (filePath) => ipcRenderer.invoke('read-file-as-base64', filePath),
    writeBackupFile: (filePath, data) => ipcRenderer.invoke('write-backup-file', filePath, data),
    getDirectorySize: (dirPath) => ipcRenderer.invoke('get-directory-size', dirPath),
    pathExists: (filePath) => ipcRenderer.invoke('path-exists', filePath),
    getDiskSpace: (dirPath) => ipcRenderer.invoke('get-disk-space', dirPath),
    createBackupDirectory: (basePath, projectName) => ipcRenderer.invoke('create-backup-directory', basePath, projectName),
    copyFileWithProgress: (sourcePath, destPath) => ipcRenderer.invoke('copy-file-with-progress', sourcePath, destPath),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    
    // Event listeners for backup progress
    onBackupProgress: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('backup-progress', listener);
      return () => ipcRenderer.removeListener('backup-progress', listener);
    },

    onBackupComplete: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('backup-complete', listener);
      return () => ipcRenderer.removeListener('backup-complete', listener);
    },

    onBackupError: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('backup-error', listener);
      return () => ipcRenderer.removeListener('backup-error', listener);
    }
  },

  // Version Management APIs
  versions: {
    listVersionFiles: (projectVersionsDir) => ipcRenderer.invoke('list-version-files', projectVersionsDir),
    deleteVersionFile: (filePath) => ipcRenderer.invoke('delete-version-file', filePath),
    showVersionInFolder: (filePath) => ipcRenderer.invoke('show-version-in-folder', filePath),
    moveDirectory: (sourcePath, destPath) => ipcRenderer.invoke('move-directory', sourcePath, destPath)
  }
});

// SECURITY: All debug logs removed to prevent exposure of sensitive information
