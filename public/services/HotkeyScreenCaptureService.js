import { globalShortcut, screen, desktopCapturer } from 'electron';
import path from 'path';
import pkg from 'fs-extra';
const { ensureDir, writeFile } = pkg;

/**
 * Store-Compliant Hotkey Screen Capture Service
 *
 * Replaces the prohibited SetWindowsHookEx hook with Electron's globalShortcut API.
 * Uses the EXACT same screenshot code (GDI+) but triggered by user hotkey instead.
 */

export class HotkeyScreenCaptureService {
  constructor(mainWindow, options) {
    this.mainWindow = mainWindow;
    this.isActive = false;
    this.captureEvents = [];
    this.selectedSource = null; // Store selected capture source
    this.cachedBounds = null; // Cache window bounds for coordinate adjustment
    this._sharpModule = null; // Cached Sharp import for performance
    this.onCaptureCountChanged = options.onCaptureCountChanged || null;
    this.onBeforeCapture = options.onBeforeCapture || null;
    this.onAfterCapture = options.onAfterCapture || null;
    this.options = {
      ...options,
      radius: options.radius || 30,
      bookmarkHotkey: options.bookmarkHotkey || 'F10'
    };

    // Bookmark system for video recording timeline markers
    this.bookmarkEvents = [];
    this.recordingStartTime = null;

    // Initialized
  }

  /**
   * Start capture with hotkeys (Store-compliant)
   * Uses globalShortcut API instead of SetWindowsHookEx
   */
  async start() {
    if (this.isActive) {
      console.warn('Capture already active');
      return false;
    }

    try {
      // Ensure output directory exists
      await ensureDir(this.options.outputDir);

      // Register hotkeys using Electron's globalShortcut (STORE-COMPLIANT)
      const registered = this.registerHotkeys();
      if (!registered) {
        throw new Error('Failed to register hotkeys');
      }

      this.isActive = true;
      this.captureEvents = [];

      // Hotkey capture started

      return true;
    } catch (error) {
      console.error('Failed to start capture');
      this.unregisterHotkeys();
      return false;
    }
  }

  /**
   * Stop capture and return all captured events
   */
  async stop() {
    if (!this.isActive) {
      return [];
    }

    this.unregisterHotkeys();
    this.isActive = false;

    // Capture stopped
    return [...this.captureEvents];
  }

  /**
   * Register global hotkeys (STORE-COMPLIANT - not a hook!)
   * This is an allowed API, unlike SetWindowsHookEx
   */
  registerHotkeys() {
    try {
      // Primary hotkey
      const reg1 = globalShortcut.register(
        this.options.primaryHotkey,
        () => this.captureScreenshot(this.options.primaryHotkey)
      );

      if (!reg1) {
        console.error(`Failed to register primary hotkey: ${this.options.primaryHotkey}`);
        return false;
      }

      // Secondary hotkey (optional)
      if (this.options.secondaryHotkey) {
        const reg2 = globalShortcut.register(
          this.options.secondaryHotkey,
          () => this.captureScreenshot(this.options.secondaryHotkey)
        );

        if (!reg2) {
          console.error(`Failed to register secondary hotkey: ${this.options.secondaryHotkey}`);
          this.unregisterHotkeys();
          return false;
        }
      }

      // Bookmark hotkey (F10) for video recording timeline markers
      if (this.options.bookmarkHotkey) {
        const regBookmark = globalShortcut.register(
          this.options.bookmarkHotkey,
          () => this.createBookmark(this.options.bookmarkHotkey)
        );

        if (!regBookmark) {
          console.warn(`Failed to register bookmark hotkey: ${this.options.bookmarkHotkey} (non-fatal)`);
          // Non-fatal - continue without bookmark hotkey
        } else {
          // Bookmark hotkey registered
        }
      }

      return true;
    } catch (error) {
      console.error('Hotkey registration error');
      return false;
    }
  }

  /**
   * Unregister all hotkeys
   */
  unregisterHotkeys() {
    try {
      globalShortcut.unregister(this.options.primaryHotkey);
      if (this.options.secondaryHotkey) {
        globalShortcut.unregister(this.options.secondaryHotkey);
      }
      if (this.options.bookmarkHotkey) {
        globalShortcut.unregister(this.options.bookmarkHotkey);
      }
    } catch (error) {
      console.error('Error unregistering hotkeys');
    }
  }

  /**
   * Capture screenshot using desktopCapturer API (captures windows without overlays)
   * This uses the same API as video recording, which properly captures window content
   */
  async captureScreenshot(triggeredBy = 'unknown', { stepDescription, skipActiveCheck, fastMode } = {}) {
    if (!this.isActive && !skipActiveCheck) {
      return;
    }

    try {
      const cursorPos = screen.getCursorScreenPoint();

      // Get display info for DPI scaling - use the SELECTED source's display, not cursor's
      let scaleFactor = 1;
      if (this.selectedSource && this.selectedSource.id.startsWith('screen:')) {
        // For screen sources, get the specific display's scale factor
        const displays = screen.getAllDisplays();
        const sourceDisplay = displays.find(d => `screen:${d.id}` === this.selectedSource.id);
        if (sourceDisplay) {
          scaleFactor = sourceDisplay.scaleFactor || 1;
        }
      } else {
        // For windows, use cursor's display
        const display = screen.getDisplayNearestPoint(cursorPos);
        scaleFactor = display.scaleFactor || 1;
      }


      // Use desktopCapturer API - same as video recording
      // This captures the actual window content, not just screen pixels
      let screenshot = null;
      let adjustedClickX = cursorPos.x;
      let adjustedClickY = cursorPos.y;

      if (this.selectedSource) {
        // Get the selected window/screen using desktopCapturer
        // In fast mode (auto-capture), request only the needed type and smaller thumbnails
        const sourceType = this.selectedSource.id.startsWith('screen:') ? 'screen' : 'window';
        const thumbSize = fastMode ? { width: 1920, height: 1080 } : { width: 3840, height: 2160 };

        // Hide overlay before screen capture so it doesn't appear in the screenshot
        const needsOverlayHide = sourceType === 'screen' && this.onBeforeCapture;
        if (needsOverlayHide) {
          this.onBeforeCapture();
          // Wait for compositor to remove the overlay from the screen
          await new Promise(resolve => setTimeout(resolve, 80));
        }

        const sources = await desktopCapturer.getSources({
          types: fastMode ? [sourceType] : ['window', 'screen'],
          thumbnailSize: thumbSize
        });

        // Restore overlay after capture
        if (needsOverlayHide && this.onAfterCapture) {
          this.onAfterCapture();
        }

        const targetSource = sources.find(s => s.id === this.selectedSource.id);

        if (targetSource) {
          // Capturing from selected source

          // Get thumbnail as data URL
          const thumbnailDataUrl = targetSource.thumbnail.toDataURL();

          // Convert data URL to buffer
          const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
          const thumbnailBuffer = Buffer.from(base64Data, 'base64');

          const sharp = await this._getSharp();

          if (fastMode) {
            // Fast mode: skip cursor overlay and coordinate math for speed
            screenshot = await sharp(thumbnailBuffer).jpeg({ quality: 90 }).toBuffer();
          } else {
            // Normal mode: calculate cursor position and add highlight overlay
            const metadata = await sharp(thumbnailBuffer).metadata();

            if (this.selectedSource.id.startsWith('window:') && this.cachedBounds && this.cachedBounds.type === 'window') {
              const bounds = this.cachedBounds.bounds;
              const cursorPhysicalX = cursorPos.x * scaleFactor;
              const cursorPhysicalY = cursorPos.y * scaleFactor;
              const windowWidth = bounds.right - bounds.left;
              const windowHeight = bounds.bottom - bounds.top;
              const relativeX = cursorPhysicalX - bounds.left;
              const relativeY = cursorPhysicalY - bounds.top;
              const scaleX = metadata.width / windowWidth;
              const scaleY = metadata.height / windowHeight;
              adjustedClickX = relativeX * scaleX;
              adjustedClickY = relativeY * scaleY;
            } else if (this.selectedSource.id.startsWith('screen:') && this.cachedBounds && this.cachedBounds.type === 'screen') {
              const bounds = this.cachedBounds.bounds;
              const relativeX = cursorPos.x - bounds.x;
              const relativeY = cursorPos.y - bounds.y;
              const scaleX = metadata.width / bounds.width;
              const scaleY = metadata.height / bounds.height;
              adjustedClickX = relativeX * scaleX;
              adjustedClickY = relativeY * scaleY;
            }
            // Normal mode: add cursor highlight circle using Sharp
            const radius = this.options.radius;
            const svgOverlay = Buffer.from(`
              <svg width="${metadata.width}" height="${metadata.height}">
                <!-- Outer glow circle -->
                <circle cx="${adjustedClickX}" cy="${adjustedClickY}" r="${radius}"
                        stroke="#ff4444" stroke-width="4" fill="none" opacity="0.8"
                        filter="url(#glow)"/>

                <!-- Inner circle -->
                <circle cx="${adjustedClickX}" cy="${adjustedClickY}" r="${radius * 0.5}"
                        fill="rgba(255, 68, 68, 0.3)" stroke="none"/>

                <!-- Center dot -->
                <circle cx="${adjustedClickX}" cy="${adjustedClickY}" r="3"
                        fill="#ff4444" stroke="none"/>

                <!-- Glow filter -->
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
              </svg>
            `);

            screenshot = await sharp(thumbnailBuffer)
              .composite([{ input: svgOverlay, top: 0, left: 0 }])
              .jpeg({ quality: 90 })
              .toBuffer();
          }

          // Screenshot captured from source
        }
      }

      // Fallback to screen capture if source not found or not selected
      if (!screenshot) {
        // Hide overlay for fallback screen capture too
        if (this.onBeforeCapture) {
          this.onBeforeCapture();
          await new Promise(resolve => setTimeout(resolve, 80));
        }

        // Fallback to primary screen capture
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 3840, height: 2160 }
        });

        // Restore overlay after fallback capture
        if (this.onAfterCapture) {
          this.onAfterCapture();
        }

        if (sources.length > 0) {
          const thumbnailDataUrl = sources[0].thumbnail.toDataURL();
          const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
          const thumbnailBuffer = Buffer.from(base64Data, 'base64');

          // Add cursor highlight
          const sharp = await this._getSharp();
          const metadata = await sharp(thumbnailBuffer).metadata();

          const radius = this.options.radius;
          const svgOverlay = Buffer.from(`
            <svg width="${metadata.width}" height="${metadata.height}">
              <!-- Outer glow circle -->
              <circle cx="${cursorPos.x}" cy="${cursorPos.y}" r="${radius}"
                      stroke="#ff4444" stroke-width="4" fill="none" opacity="0.8"
                      filter="url(#glow)"/>

              <!-- Inner circle -->
              <circle cx="${cursorPos.x}" cy="${cursorPos.y}" r="${radius * 0.5}"
                      fill="rgba(255, 68, 68, 0.3)" stroke="none"/>

              <!-- Center dot -->
              <circle cx="${cursorPos.x}" cy="${cursorPos.y}" r="3"
                      fill="#ff4444" stroke="none"/>

              <!-- Glow filter -->
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
            </svg>
          `);

          screenshot = await sharp(thumbnailBuffer)
            .composite([{ input: svgOverlay, top: 0, left: 0 }])
            .jpeg({ quality: 90 })
            .toBuffer();
        }
      }

      if (!screenshot) {
        throw new Error('Failed to capture screenshot');
      }

      // Save screenshot
      const captureEvent = {
        id: `capture_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: Date.now(),
        x: cursorPos.x,
        y: cursorPos.y,
        screenshotPath: ''
      };

      const filename = `screenshot_${captureEvent.id}.jpg`;
      const filepath = path.join(this.options.outputDir, filename);

      await writeFile(filepath, screenshot);
      captureEvent.screenshotPath = filepath;

      this.captureEvents.push(captureEvent);

      // Notify overlay of updated step count
      if (this.onCaptureCountChanged) {
        this.onCaptureCountChanged(this.captureEvents.length);
      }

      // Notify renderer
      if (this.mainWindow?.webContents) {
        const screenshotPayload = {
          pngBuffer: screenshot.toString('base64'),
          clickX: cursorPos.x,
          clickY: cursorPos.y,
          timestamp: captureEvent.timestamp,
          clickId: captureEvent.id,
          triggeredBy
        };
        if (stepDescription) {
          screenshotPayload.stepDescription = stepDescription;
        }
        this.mainWindow.webContents.send('native-screenshot-ready', screenshotPayload);
      }

      // Screenshot saved

    } catch (error) {
      console.error('Screenshot capture error');

      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('screenshot-error', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }


  /**
   * Set the selected capture source (window or screen)
   */
  async _getSharp() {
    if (!this._sharpModule) {
      const mod = await import('sharp');
      this._sharpModule = mod.default;
    }
    return this._sharpModule;
  }

  setSelectedSource(source, cachedBounds = null) {
    this.selectedSource = source;
    this.cachedBounds = cachedBounds;
    if (source) {
      // Capture source set
    } else {
      // Capture source cleared
    }
  }

  /**
   * Update hotkey configuration
   * Allows changing hotkeys without restarting capture
   */
  async updateHotkeys(primaryHotkey, secondaryHotkey) {
    const wasActive = this.isActive;

    if (wasActive) {
      // Temporarily stop to unregister old hotkeys
      this.unregisterHotkeys();
    }

    // Update configuration
    this.options.primaryHotkey = primaryHotkey;
    this.options.secondaryHotkey = secondaryHotkey;

    if (wasActive) {
      // Re-register with new hotkeys
      const registered = this.registerHotkeys();
      if (!registered) {
        console.error('Failed to re-register hotkeys');
        this.isActive = false;
        return false;
      }
      // Hotkeys updated
    }

    return true;
  }

  /**
   * Manual screenshot trigger (for UI button)
   */
  async captureManual() {
    if (!this.isActive) {
      throw new Error('Capture service not active');
    }

    await this.captureScreenshot('manual-trigger');
    return this.captureEvents[this.captureEvents.length - 1] || null;
  }

  /**
   * Create a bookmark (timeline marker) during video recording
   * Does NOT take a screenshot - just marks the timestamp
   */
  createBookmark(triggeredBy = 'F10') {
    if (!this.isActive) {
      return;
    }

    const now = Date.now();
    const relativeTimestamp = this.recordingStartTime
      ? now - this.recordingStartTime
      : now;

    const bookmarkEvent = {
      id: `bookmark_${now}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: relativeTimestamp,
      recordingTimestamp: now,
      title: `Bookmark at ${this.formatTime(relativeTimestamp)}`,
      description: ''
    };

    this.bookmarkEvents.push(bookmarkEvent);

    // Notify renderer
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('bookmark-created', bookmarkEvent);
    }

    // Bookmark created
  }

  /**
   * Format milliseconds to MM:SS
   */
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Set the recording start time for bookmark timestamps
   */
  setRecordingStartTime(startTime) {
    this.recordingStartTime = startTime;
    // Recording start time set
  }

  /**
   * Get all bookmark events
   */
  getBookmarkEvents() {
    return [...this.bookmarkEvents];
  }

  /**
   * Clear bookmark events (call at start of new recording)
   */
  clearBookmarkEvents() {
    this.bookmarkEvents = [];
    // Bookmark events cleared
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.isActive) {
      this.unregisterHotkeys();
      this.isActive = false;
    }

    if (this.nativeCapture) {
      try {
        this.nativeCapture.shutdown();
      } catch (error) {
        console.error('Error shutting down native capture');
      }
    }

    // Clear captured events to free memory
    this.captureEvents = [];
    this.selectedSource = null;
    this.cachedBounds = null;
  }

  /**
   * Get all captured events
   */
  getEvents() {
    return [...this.captureEvents];
  }

  /**
   * Check if service is running
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Get current hotkey configuration
   */
  getHotkeys() {
    return {
      primary: this.options.primaryHotkey,
      secondary: this.options.secondaryHotkey
    };
  }
}
