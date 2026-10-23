// TranslationModuleManager.js - On-demand translation module download and management
// Downloads Python runtime + translation models from a configured URL to AppData

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import https from 'https';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import logPkg from 'electron-log';
import { safeExtractZip } from './safeExtractZip.js';
const log = logPkg;

// Where the translation module is hosted. Not configured by default: set the
// DOCFAI_TRANSLATION_URL environment variable to the folder that contains
// translation-module-manifest.json and translation-module.zip
// (build them with `npm run build-translation-module`).
const TRANSLATION_MODULE_BASE_URL = (process.env.DOCFAI_TRANSLATION_URL || '').replace(/\/+$/, '');
const MANIFEST_FILENAME = 'translation-module-manifest.json';
const ZIP_FILENAME = 'translation-module.zip';

/**
 * TranslationModuleManager handles the lifecycle of the on-demand translation module.
 *
 * The translation module contains:
 *   - Python 3.11 runtime with argostranslate
 *   - EN/DE translation models (.argosmodel)
 *   - translate.py script
 *
 * Installed to: %APPDATA%/Docfai/translation-module/
 */
class TranslationModuleManager {
  constructor() {
    this._downloadAbortController = null;
    this._isDownloading = false;
    this._mainWindow = null;
  }

  /**
   * Set the main window reference for sending progress events to renderer
   */
  setMainWindow(mainWindow) {
    this._mainWindow = mainWindow;
  }

  /**
   * Get the base path for the translation module
   * @returns {string} Path to %APPDATA%/Docfai/translation-module/
   */
  getModulePath() {
    return path.join(app.getPath('appData'), 'Docfai', 'translation-module');
  }

  /**
   * Get path to the installed manifest
   * @returns {string}
   */
  getManifestPath() {
    return path.join(this.getModulePath(), 'manifest.json');
  }

  /**
   * Get path to the Python executable within the module
   * @returns {string}
   */
  getPythonPath() {
    return path.join(this.getModulePath(), 'runtime', 'python.exe');
  }

  /**
   * Get path to the translate.py script within the module
   * @returns {string}
   */
  getTranslateScriptPath() {
    return path.join(this.getModulePath(), 'translate.py');
  }

  /**
   * Get path to the models directory within the module
   * @returns {string}
   */
  getModelsPath() {
    return path.join(this.getModulePath(), 'models');
  }

  /**
   * Check if the translation module is fully installed and valid
   * @returns {boolean}
   */
  isInstalled() {
    try {
      const manifestPath = this.getManifestPath();
      const pythonPath = this.getPythonPath();
      const scriptPath = this.getTranslateScriptPath();

      return (
        fs.existsSync(manifestPath) &&
        fs.existsSync(pythonPath) &&
        fs.existsSync(scriptPath)
      );
    } catch (error) {
      log.error('[TranslationModule] Error checking installation:', error.message);
      return false;
    }
  }

  /**
   * Get current module status
   * @returns {{ installed: boolean, version?: string, path?: string, sizeOnDisk?: number }}
   */
  getStatus() {
    const installed = this.isInstalled();
    const result = { installed };

    if (installed) {
      try {
        const manifest = JSON.parse(fs.readFileSync(this.getManifestPath(), 'utf-8'));
        result.version = manifest.version;
        result.path = this.getModulePath();
        result.installedAt = manifest.installedAt;
      } catch (error) {
        log.error('[TranslationModule] Error reading manifest:', error.message);
      }
    }

    return result;
  }

  /**
   * Check available disk space on the drive where AppData resides
   * @returns {Promise<{ available: number, required: number, sufficient: boolean }>}
   */
  async checkDiskSpace() {
    const modulePath = this.getModulePath();
    const drive = path.parse(modulePath).root;

    try {
      // One-shot disk-space check during translation module download, not on any hot path.
      // eslint-disable-next-line no-restricted-syntax -- wmic one-shot: see docs/WINDOW_CAPTURE_STABILITY.md
      const { execSync } = await import('child_process');
      const driveLetter = drive.replace('\\', '').replace(':', '');
      const output = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}:'" get FreeSpace /format:value`,
        { encoding: 'utf-8' }
      ).trim();

      const match = output.match(/FreeSpace=(\d+)/);
      const available = match ? parseInt(match[1], 10) : 0;
      // Need space for zip download (~600MB) + extraction (~1.6GB) = ~2.2GB
      const required = 2200 * 1024 * 1024;

      return {
        available,
        required,
        sufficient: available >= required
      };
    } catch (error) {
      log.error('[TranslationModule] Error checking disk space:', error.message);
      // Default: assume sufficient if we can't check
      return { available: 0, required: 0, sufficient: true };
    }
  }

  /**
   * Fetch the remote manifest from the configured URL
   * @returns {Promise<object>} Manifest object with version, sha256, size, downloadUrl
   */
  async _fetchRemoteManifest() {
    if (!TRANSLATION_MODULE_BASE_URL) {
      throw new Error('Offline translation is not available in this build (DOCFAI_TRANSLATION_URL is not set)');
    }
    const manifestUrl = `${TRANSLATION_MODULE_BASE_URL}/${MANIFEST_FILENAME}`;
    return new Promise((resolve, reject) => {
      const urlObj = new URL(manifestUrl);
      https.get({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'Docfai-App' }
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Manifest download failed with status ${res.statusCode}`));
          res.resume();
          return;
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const manifest = JSON.parse(data);
            if (!manifest.downloadUrl) {
              manifest.downloadUrl = `${TRANSLATION_MODULE_BASE_URL}/${ZIP_FILENAME}`;
            }
            this._validateRemoteManifest(manifest);
            resolve(manifest);
          } catch (e) {
            reject(new Error(e.message || 'Failed to parse translation module manifest'));
          }
        });
      }).on('error', reject);
    });
  }

  _validateRemoteManifest(manifest) {
    const sha256Pattern = /^[a-f0-9]{64}$/i;
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Invalid translation module manifest');
    }

    if (!sha256Pattern.test(manifest.sha256 || '')) {
      throw new Error('Translation module manifest is missing a valid archive hash');
    }

    if (!manifest.modelHashes || typeof manifest.modelHashes !== 'object') {
      throw new Error('Translation module manifest is missing model hashes');
    }

    for (const modelName of ['translate-en_de.argosmodel', 'translate-de_en.argosmodel']) {
      if (!sha256Pattern.test(manifest.modelHashes[modelName] || '')) {
        throw new Error(`Translation module manifest is missing hash for ${modelName}`);
      }
    }
  }

  /**
   * Download the translation module zip from the configured URL
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async download() {
    if (this._isDownloading) {
      return { success: false, error: 'Download already in progress' };
    }

    this._isDownloading = true;
    this._downloadAbortController = new AbortController();

    const modulePath = this.getModulePath();
    const zipPath = path.join(modulePath, ZIP_FILENAME);

    try {
      log.info('[TranslationModule] Starting download...');

      // Check disk space first
      const diskSpace = await this.checkDiskSpace();
      if (!diskSpace.sufficient) {
        throw new Error(
          `Insufficient disk space. Available: ${Math.round(diskSpace.available / (1024 * 1024))} MB, ` +
          `Required: ${Math.round(diskSpace.required / (1024 * 1024))} MB`
        );
      }

      // Ensure module directory exists
      fs.mkdirSync(modulePath, { recursive: true });

      // Fetch remote manifest to get download URL and expected hash
      this._sendProgress({ phase: 'preparing', percent: 0, message: 'Fetching module information...' });
      const remoteManifest = await this._fetchRemoteManifest();
      log.info(`[TranslationModule] Remote manifest: v${remoteManifest.version}, size: ${remoteManifest.size}`);

      // Download zip file
      this._sendProgress({ phase: 'downloading', percent: 0, transferred: 0, total: remoteManifest.size, bytesPerSecond: 0 });

      await this._downloadZip(remoteManifest.downloadUrl, zipPath, remoteManifest.size);

      // Verify SHA-256
      this._sendProgress({ phase: 'verifying', percent: 0, message: 'Verifying download integrity...' });
      const isValid = await this._verifyHash(zipPath, remoteManifest.sha256);
      if (!isValid) {
        // Clean up corrupted file
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        throw new Error('Download verification failed. The file may be corrupted. Please try again.');
      }
      log.info('[TranslationModule] SHA-256 verification passed');

      // Extract zip
      this._sendProgress({ phase: 'extracting', percent: 0, message: 'Extracting translation module...' });
      await this._extractZip(zipPath, modulePath);
      log.info('[TranslationModule] Extraction complete');

      // Verify extracted model files against pinned manifest hashes
      this._sendProgress({ phase: 'verifying', percent: 0, message: 'Verifying translation models...' });
      await this._verifyModelHashes(remoteManifest.modelHashes);
      log.info('[TranslationModule] Model hash verification passed');

      // Clean up zip file to save space
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

      // Write local manifest
      const localManifest = {
        version: remoteManifest.version,
        sha256: remoteManifest.sha256,
        modelHashes: remoteManifest.modelHashes,
        installedAt: new Date().toISOString(),
        appVersion: app.getVersion()
      };
      fs.writeFileSync(this.getManifestPath(), JSON.stringify(localManifest, null, 2));

      log.info('[TranslationModule] Installation complete');
      this._sendComplete({ success: true });
      return { success: true };

    } catch (error) {
      const isAborted = error.name === 'AbortError' || this._downloadAbortController?.signal?.aborted;
      const errorMsg = isAborted ? 'Download cancelled by user' : error.message;

      log.error('[TranslationModule] Download failed:', errorMsg);

      // Clean up partial files
      this._cleanupPartialDownload(zipPath);

      this._sendComplete({ success: false, error: errorMsg });
      return { success: false, error: errorMsg };

    } finally {
      this._isDownloading = false;
      this._downloadAbortController = null;
    }
  }

  /**
   * Download the zip file from a public HTTPS URL with progress tracking
   */
  _downloadZip(assetUrl, destPath, expectedSize) {
    return new Promise((resolve, reject) => {
      const signal = this._downloadAbortController?.signal;

      if (signal?.aborted) {
        reject(new Error('Download cancelled'));
        return;
      }

      const makeRequest = (url) => {
        const urlObj = new URL(url);
        const headers = { 'User-Agent': 'Docfai-App' };

        const req = https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers }, (res) => {
          // Follow redirects without forwarding credentials.
          if (res.statusCode === 302 || res.statusCode === 301) {
            makeRequest(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`));
            res.resume();
            return;
          }

          const totalSize = parseInt(res.headers['content-length'], 10) || expectedSize;
          let downloadedSize = 0;
          let lastProgressTime = Date.now();
          let lastDownloadedSize = 0;

          const writeStream = createWriteStream(destPath);

          // Handle abort
          const abortHandler = () => {
            res.destroy();
            writeStream.destroy();
            reject(new Error('Download cancelled'));
          };

          if (signal) {
            signal.addEventListener('abort', abortHandler, { once: true });
          }

          res.on('data', (chunk) => {
            downloadedSize += chunk.length;

            const now = Date.now();
            const elapsed = (now - lastProgressTime) / 1000;

            if (elapsed >= 0.5) { // Update progress every 500ms
              const bytesPerSecond = (downloadedSize - lastDownloadedSize) / elapsed;
              const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

              this._sendProgress({
                phase: 'downloading',
                percent,
                transferred: downloadedSize,
                total: totalSize,
                bytesPerSecond
              });

              lastProgressTime = now;
              lastDownloadedSize = downloadedSize;
            }
          });

          res.pipe(writeStream);

          writeStream.on('finish', () => {
            if (signal) signal.removeEventListener('abort', abortHandler);
            this._sendProgress({ phase: 'downloading', percent: 100, transferred: downloadedSize, total: totalSize, bytesPerSecond: 0 });
            resolve();
          });

          writeStream.on('error', (err) => {
            if (signal) signal.removeEventListener('abort', abortHandler);
            reject(err);
          });

          res.on('error', (err) => {
            if (signal) signal.removeEventListener('abort', abortHandler);
            writeStream.destroy();
            reject(err);
          });
        });

        req.on('error', reject);
      };

      makeRequest(assetUrl);
    });
  }

  /**
   * Verify SHA-256 hash of downloaded file
   * @param {string} filePath
   * @param {string} expectedHash
   * @returns {Promise<boolean>}
   */
  async _verifyHash(filePath, expectedHash) {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const computedHash = hash.digest('hex');
        log.info(`[TranslationModule] Expected hash: ${expectedHash}`);
        log.info(`[TranslationModule] Computed hash: ${computedHash}`);
        resolve(computedHash === expectedHash);
      });
      stream.on('error', reject);
    });
  }

  async _verifyModelHashes(modelHashes) {
    const modelsPath = this.getModelsPath();

    for (const [modelName, expectedHash] of Object.entries(modelHashes)) {
      if (modelName.includes('/') || modelName.includes('\\') || path.basename(modelName) !== modelName) {
        throw new Error(`Invalid model name in manifest: ${modelName}`);
      }

      const modelPath = path.join(modelsPath, modelName);
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Translation model is missing: ${modelName}`);
      }

      const isValid = await this._verifyHash(modelPath, expectedHash);
      if (!isValid) {
        throw new Error(`Translation model verification failed: ${modelName}`);
      }
    }
  }

  /**
   * Extract the zip file to the module directory
   * @param {string} zipPath
   * @param {string} destPath
   */
  async _extractZip(zipPath, destPath) {
    await safeExtractZip(zipPath, destPath);
  }

  /**
   * Clean up partial download files
   * @param {string} zipPath
   */
  _cleanupPartialDownload(zipPath) {
    try {
      if (zipPath && fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        log.info('[TranslationModule] Cleaned up partial download');
      }
    } catch (error) {
      log.error('[TranslationModule] Error cleaning up partial download:', error.message);
    }
  }

  /**
   * Cancel an in-progress download
   */
  cancelDownload() {
    if (this._downloadAbortController) {
      this._downloadAbortController.abort();
      log.info('[TranslationModule] Download cancelled by user');
    }
  }

  /**
   * Uninstall the translation module (remove all files)
   * @returns {{ success: boolean, error?: string }}
   */
  uninstall() {
    try {
      const modulePath = this.getModulePath();

      if (!fs.existsSync(modulePath)) {
        return { success: true };
      }

      fs.rmSync(modulePath, { recursive: true, force: true });
      log.info('[TranslationModule] Module uninstalled');
      return { success: true };
    } catch (error) {
      log.error('[TranslationModule] Uninstall failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send progress event to renderer process
   */
  _sendProgress(data) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send('translation-module:download-progress', data);
    }
  }

  /**
   * Send completion event to renderer process
   */
  _sendComplete(data) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send('translation-module:download-complete', data);
    }
  }
}

// Export singleton instance
const translationModuleManager = new TranslationModuleManager();
export default translationModuleManager;
