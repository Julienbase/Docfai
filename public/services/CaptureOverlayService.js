import { BrowserWindow, screen, app } from 'electron';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Capture Overlay Service
 *
 * Creates a transparent, click-through overlay window that highlights the
 * capture source boundaries with a pulsing orange border and shows a
 * "Step N" counter badge in the bottom-right corner.
 *
 * The overlay is completely independent from the capture pipeline and
 * has zero performance impact on screenshot capture speed.
 */
export class CaptureOverlayService {
  constructor() {
    this.overlayWindow = null;
    this.positionInterval = null;
    this.currentBounds = null;
    this.sourceType = null; // 'window' | 'screen'
    this.stepCount = 0;
    this._tmpHtmlPath = null;
  }

  /**
   * Show the capture overlay on top of the given source.
   * @param {{ x: number, y: number, width: number, height: number }} bounds - Source bounds (logical pixels)
   * @param {'window' | 'screen'} sourceType - Whether the source is a window or screen
   */
  show(bounds, sourceType = 'window') {
    this.hide(); // Clean up any existing overlay

    this.sourceType = sourceType;
    this.stepCount = 0;
    this.currentBounds = bounds;

    // For screen sources, inset so the border is clearly visible inside the monitor
    const margin = sourceType === 'screen' ? 16 : 0;
    const overlayBounds = {
      x: bounds.x + margin,
      y: bounds.y + margin,
      width: bounds.width - margin * 2,
      height: bounds.height - margin * 2,
    };

    this.overlayWindow = new BrowserWindow({
      ...overlayBounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      roundedCorners: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Make clicks pass through the overlay
    this.overlayWindow.setIgnoreMouseEvents(true);

    // Prevent the overlay from appearing in the taskbar or alt-tab
    this.overlayWindow.setSkipTaskbar(true);

    // Load the overlay HTML from a temp file (avoids AV flags on data: URIs)
    const html = this._generateHTML(overlayBounds.width, overlayBounds.height);
    this._tmpHtmlPath = join(tmpdir(), `docfai-capture-overlay-${randomUUID()}.html`);
    writeFileSync(this._tmpHtmlPath, html, 'utf-8');
    this.overlayWindow.loadFile(this._tmpHtmlPath);

    // Start position tracking for window sources (200ms refresh)
    if (sourceType === 'window') {
      this.positionInterval = setInterval(() => {
        this._refreshPosition();
      }, 200);
    }

  }

  /**
   * Update the step counter displayed on the overlay.
   * @param {number} count - Current step/screenshot count
   */
  updateCount(count) {
    // Sanitize: ensure count is a finite integer before interpolating into JS
    const safeCount = Number.isFinite(count) ? Math.floor(count) : 0;
    this.stepCount = safeCount;
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.executeJavaScript(
        `document.getElementById('step-badge').textContent = 'Step ${safeCount}';`
      ).catch(() => {});
      // Trigger capture flash
      this.flashCapture();
    }
  }

  /**
   * Trigger a brief inward flash/pulse to indicate a screenshot was captured.
   */
  flashCapture() {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.overlayWindow.webContents.executeJavaScript(`
      (function() {
        const el = document.getElementById('capture-flash');
        if (!el) return;
        // Clone and replace to guarantee animation restart every time
        const clone = el.cloneNode(true);
        clone.classList.add('active');
        el.parentNode.replaceChild(clone, el);
      })();
    `).catch(() => {});
  }

  /**
   * Update the overlay position to match current source bounds.
   * @param {{ x: number, y: number, width: number, height: number }} bounds
   */
  updatePosition(bounds) {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    this.currentBounds = bounds;
    const margin = this.sourceType === 'screen' ? 6 : 0;
    const overlayBounds = {
      x: bounds.x + margin,
      y: bounds.y + margin,
      width: bounds.width - margin * 2,
      height: bounds.height - margin * 2,
    };

    this.overlayWindow.setBounds({
      x: Math.round(overlayBounds.x),
      y: Math.round(overlayBounds.y),
      width: Math.round(overlayBounds.width),
      height: Math.round(overlayBounds.height),
    });
  }

  /**
   * Temporarily hide the overlay (before screenshot capture).
   */
  temporaryHide() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  /**
   * Show the overlay again after screenshot capture.
   */
  temporaryShow() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.showInactive();
    }
  }

  /**
   * Hide and destroy the overlay.
   */
  hide() {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = null;
    this.currentBounds = null;
    this.sourceType = null;
    this.stepCount = 0;

    // Clean up temp HTML file
    if (this._tmpHtmlPath) {
      try { unlinkSync(this._tmpHtmlPath); } catch (e) { /* ignore */ }
      this._tmpHtmlPath = null;
    }

  }

  /**
   * Refresh position from current bounds (called on interval for window sources).
   */
  _refreshPosition() {
    if (!this.currentBounds || !this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    // The bounds are updated externally by the caller (electron.js boundsRefreshInterval)
    // This just re-applies the position in case of drift
  }

  /**
   * Generate the overlay HTML with pulsing orange border and step badge.
   */
  _generateHTML(width, height) {
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
    -webkit-app-region: no-drag;
  }
  .overlay {
    position: absolute;
    inset: 0;
    border: 4px solid #F27F3D;
    border-radius: ${this.sourceType === 'window' ? '8px' : '0'};
    pointer-events: none;
    animation: pulse-border 2s ease-in-out infinite;
    box-shadow:
      0 0 8px rgba(242, 127, 61, 0.5),
      0 0 16px rgba(242, 127, 61, 0.25),
      inset 0 0 8px rgba(242, 127, 61, 0.15);
  }
  @keyframes pulse-border {
    0%, 100% {
      border-color: #F27F3D;
      box-shadow:
        0 0 8px rgba(242, 127, 61, 0.5),
        0 0 16px rgba(242, 127, 61, 0.25),
        inset 0 0 8px rgba(242, 127, 61, 0.15);
    }
    50% {
      border-color: #FF9A5C;
      box-shadow:
        0 0 14px rgba(242, 127, 61, 0.7),
        0 0 28px rgba(242, 127, 61, 0.35),
        inset 0 0 14px rgba(242, 127, 61, 0.2);
    }
  }
  .step-badge {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: #F27F3D;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 20px;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    letter-spacing: 0.3px;
    animation: badge-in 0.3s ease-out;
    white-space: nowrap;
  }
  @keyframes badge-in {
    from { transform: scale(0.5); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .capture-flash {
    position: absolute;
    inset: 0;
    border-radius: ${this.sourceType === 'window' ? '8px' : '0'};
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(242, 127, 61, 0.4) 100%);
    box-shadow: inset 0 0 60px rgba(242, 127, 61, 0.3);
  }
  .capture-flash.active {
    animation: flash-in 0.7s ease-out forwards;
  }
  @keyframes flash-in {
    0% { opacity: 1; box-shadow: inset 0 0 120px rgba(242, 127, 61, 0.6); }
    40% { opacity: 0.7; box-shadow: inset 0 0 60px rgba(242, 127, 61, 0.35); }
    100% { opacity: 0; box-shadow: inset 0 0 0px rgba(242, 127, 61, 0); }
  }
</style>
</head>
<body>
  <div class="overlay"></div>
  <div class="capture-flash" id="capture-flash"></div>
  <div class="step-badge" id="step-badge">Step 0</div>
</body>
</html>`;
  }
}
