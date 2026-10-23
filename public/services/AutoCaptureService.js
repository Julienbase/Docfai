import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * Auto-Capture Service
 *
 * Automatically captures screenshots on every mouse click across any Windows
 * application. Uses a C++ native module with SetWindowsHookEx(WH_MOUSE_LL)
 * low-level mouse hook and queries Windows UI Automation for element identification.
 *
 * NOTE: WH_MOUSE_LL is not permitted in Microsoft Store (appx) builds.
 * Auto-capture mode must be disabled for Store distribution.
 *
 * Delegates actual screenshot capture to HotkeyScreenCaptureService to reuse
 * the existing desktopCapturer + Sharp + DPI handling pipeline.
 *
 * Source-aware: when a specific window is selected, only clicks on that window
 * are captured. "Entire Screen" mode captures all clicks.
 */

export class AutoCaptureService {
  constructor(mainWindow, hotkeyScreenCaptureService, options = {}) {
    this.mainWindow = mainWindow;
    this.hotkeyCapture = hotkeyScreenCaptureService;
    this.isActive = false;
    this.captureCount = 0;
    this.captureEvents = [];
    this.nativeModule = null;

    // Capture queue to handle async screenshot saves
    this.captureInProgress = false;
    this.captureQueue = [];
    this.maxQueueDepth = 3;

    // Monitor bounds for screen-source filtering
    this.sourceBounds = null; // { x, y, width, height } for screen sources

    // Overlay callback for step count updates
    this.onCaptureCountChanged = options.onCaptureCountChanged || null;

    // Configuration
    this.config = {
      pollIntervalMs: options.pollIntervalMs || 15,
      debounceMs: options.debounceMs || 300,
      captureRightClicks: options.captureRightClicks !== undefined ? options.captureRightClicks : false,
      excludedProcesses: options.excludedProcesses || ['Docfai'],
      showNotifications: options.showNotifications !== undefined ? options.showNotifications : false,
    };

  }

  /**
   * Start auto-capture mode.
   * Loads the native module and begins click detection polling.
   *
   * @param {HWND|null} targetWindowHandle - Window handle to filter clicks (null = entire screen)
   * @param {{ x: number, y: number, width: number, height: number }|null} screenBounds - Monitor bounds for screen source filtering
   */
  async start(targetWindowHandle = null, screenBounds = null) {
    this.sourceBounds = screenBounds;
    if (this.isActive) {
      console.warn('Auto-capture is already running');
      return false;
    }

    try {
      // Load native module
      this.nativeModule = this._loadNativeModule();
      if (!this.nativeModule) {
        throw new Error('Failed to load auto_click_capture native module');
      }

      // Set target window for source filtering
      if (targetWindowHandle) {
        this.nativeModule.setTargetWindow(targetWindowHandle);
      } else {
        this.nativeModule.setTargetWindow(0); // Entire screen
      }

      // Reset state
      this.captureCount = 0;
      this.captureEvents = [];
      this.captureQueue = [];
      this.captureInProgress = false;

      // Start click detection with callback
      this.nativeModule.startClickDetection(
        (event) => this._onClickDetected(event),
        {
          pollIntervalMs: this.config.pollIntervalMs,
          debounceMs: this.config.debounceMs,
          captureRightClicks: this.config.captureRightClicks,
        }
      );

      this.isActive = true;

      return true;
    } catch (error) {
      console.error('Failed to start auto-capture');
      this._cleanup();
      return false;
    }
  }

  /**
   * Stop auto-capture mode.
   * Terminates the polling thread, drains the capture queue, and returns results.
   */
  async stop() {
    if (!this.isActive) {
      return { captureCount: 0, events: [] };
    }

    this.isActive = false;

    // Stop the native polling thread
    if (this.nativeModule) {
      try {
        this.nativeModule.stopClickDetection();
      } catch (error) {
        console.error('Error stopping click detection');
      }
    }

    // Wait for any in-flight capture to finish
    await this._drainCaptureQueue();

    const result = {
      captureCount: this.captureCount,
      events: [...this.captureEvents],
    };

    // Cleanup native module reference
    this.nativeModule = null;

    return result;
  }

  /**
   * Cleanup all resources. Called on app quit.
   */
  cleanup() {
    if (this.isActive) {
      this.isActive = false;
      if (this.nativeModule) {
        try {
          this.nativeModule.stopClickDetection();
        } catch (_) {}
      }
    }
    this.nativeModule = null;
    this.captureEvents = [];
    this.captureQueue = [];
    this.sourceBounds = null;
  }

  /**
   * Update configuration (can be called while running).
   */
  updateConfig(newConfig) {
    if (newConfig.debounceMs !== undefined) {
      this.config.debounceMs = Math.max(50, Math.min(2000, newConfig.debounceMs));
    }
    if (newConfig.captureRightClicks !== undefined) {
      this.config.captureRightClicks = newConfig.captureRightClicks;
    }
    if (newConfig.showNotifications !== undefined) {
      this.config.showNotifications = newConfig.showNotifications;
    }
    if (newConfig.excludedProcesses !== undefined) {
      this.config.excludedProcesses = newConfig.excludedProcesses;
    }

    // If running, restart with new config
    if (this.isActive && this.nativeModule) {
      // Note: debounceMs and captureRightClicks are set at startClickDetection time.
      // To apply changes while running, we'd need to stop+restart the native module.
      // For now, config changes take effect on next start.
    }
  }

  /**
   * Check if auto-capture is currently running.
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Get all captured events.
   */
  getEvents() {
    return [...this.captureEvents];
  }

  /**
   * Get current capture count.
   */
  getCaptureCount() {
    return this.captureCount;
  }

  // ---- Private methods ----

  /**
   * Load the native auto_click_capture module.
   * Tries multiple paths (dev, production).
   */
  _loadNativeModule() {
    const possiblePaths = [
      // Development (__dirname is public/services, go up 2 levels to project root)
      path.join(__dirname, '..', '..', 'build', 'Release', 'auto_click_capture.node'),
      // Production (packaged app)
      path.join(process.resourcesPath || '', 'build', 'Release', 'auto_click_capture.node'),
      // Alternative production path (asar unpacked)
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'Release', 'auto_click_capture.node'),
    ];

    for (const modulePath of possiblePaths) {
      try {
        const nativeModule = require(modulePath);
        return nativeModule;
      } catch (err) {
        // Silently try next path
      }
    }

    console.error('Failed to load auto_click_capture native module');
    return null;
  }

  /**
   * Callback when a click is detected by the native module.
   * Triggers screenshot capture and emits event to renderer.
   */
  _onClickDetected(event) {
    if (!this.isActive) return;

    // Filter out clicks on the Docfai window itself (e.g., switching sources)
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isFocused()) {
      return;
    }

    // Filter clicks outside the selected monitor bounds (for screen sources)
    if (this.sourceBounds) {
      const { x, y, width, height } = this.sourceBounds;
      if (
        event.clickX < x || event.clickX >= x + width ||
        event.clickY < y || event.clickY >= y + height
      ) {
        return; // Click is outside the selected monitor
      }
    }

    // Generate step description from element info
    const stepDescription = this._generateStepDescription(
      event.clickType,
      event.element,
      event.clickX,
      event.clickY
    );

    // Emit real-time click event to renderer (for live feed)
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('auto-capture-click-detected', {
        clickX: event.clickX,
        clickY: event.clickY,
        clickType: event.clickType,
        timestamp: event.timestamp,
        elementName: event.element?.name || null,
        elementType: event.element?.controlType || 'element',
        stepDescription,
      });
    }

    // Queue screenshot capture
    this._queueCapture(event, stepDescription);
  }

  /**
   * Queue a screenshot capture. Handles backpressure.
   */
  _queueCapture(event, stepDescription) {
    if (this.captureQueue.length >= this.maxQueueDepth) {
      console.warn('Auto-capture queue full, dropping click event');
      return;
    }

    this.captureQueue.push({ event, stepDescription });
    this._processQueue();
  }

  /**
   * Process the capture queue sequentially.
   */
  async _processQueue() {
    if (this.captureInProgress || this.captureQueue.length === 0) return;

    this.captureInProgress = true;

    while (this.captureQueue.length > 0 && this.isActive) {
      const { event, stepDescription } = this.captureQueue.shift();

      try {
        // Delegate screenshot capture to HotkeyScreenCaptureService
        // skipActiveCheck: true because the hotkey service may not be "started"
        await this.hotkeyCapture.captureScreenshot('auto-click', {
          stepDescription,
          skipActiveCheck: true,
          fastMode: true,
        });

        this.captureCount++;

        // Notify overlay of updated step count
        if (this.onCaptureCountChanged) {
          this.onCaptureCountChanged(this.captureCount);
        }

        // Record event
        this.captureEvents.push({
          id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: event.timestamp,
          clickX: event.clickX,
          clickY: event.clickY,
          clickType: event.clickType,
          stepDescription,
          elementName: event.element?.name || null,
          elementType: event.element?.controlType || 'element',
        });

      } catch (error) {
        console.error('Auto-capture screenshot failed');

        // Notify renderer of error but continue running
        if (this.mainWindow?.webContents) {
          this.mainWindow.webContents.send('auto-capture-error', {
            error: error instanceof Error ? error.message : 'Screenshot capture failed',
            clickX: event.clickX,
            clickY: event.clickY,
          });
        }
      }
    }

    this.captureInProgress = false;
  }

  /**
   * Wait for the capture queue to drain (used during stop).
   */
  async _drainCaptureQueue() {
    // Wait up to 5 seconds for in-flight captures to complete
    const maxWait = 5000;
    const startTime = Date.now();

    while (this.captureInProgress && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear any remaining items (capture may have been too slow)
    this.captureQueue = [];
  }

  /**
   * Generate a human-readable step description from UIAutomation element info.
   */
  _generateStepDescription(clickType, element, clickX, clickY) {
    const verb = {
      'click': 'Click',
      'rightclick': 'Right-click',
      'doubleclick': 'Double-click',
    }[clickType] || 'Click';

    // No element info at all
    if (!element || (!element.name && element.controlType === 'element')) {
      return `${verb} at position (${clickX}, ${clickY})`;
    }

    const typeLabel = element.controlType || 'element';

    // PII safety: never include text content from editable input fields
    // (may contain passwords, emails, personal data)
    const piiControlTypes = ['edit', 'document', 'spinner'];
    const isPiiRisk = piiControlTypes.some(t =>
      typeLabel.toLowerCase().includes(t)
    );

    if (element.name && !isPiiRisk) {
      // Truncate long names
      const name = element.name.length > 50
        ? element.name.substring(0, 47) + '...'
        : element.name;
      return `${verb} the '${name}' ${typeLabel}`;
    }

    // Known type but no name
    return `${verb} the ${typeLabel}`;
  }

  /**
   * Cleanup internal state.
   */
  _cleanup() {
    this.isActive = false;
    this.nativeModule = null;
    this.captureQueue = [];
    this.captureInProgress = false;
  }
}
