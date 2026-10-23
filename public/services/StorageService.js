// StorageService.js - Electron-store based persistent storage service
// Replaces localStorage to resolve QuotaExceededError issues

import Store from 'electron-store';
import { app } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import StorageCleanup from './StorageCleanup.js';

/**
 * Storage Service for persistent data storage using electron-store
 * This service bypasses browser localStorage quota limits by using file-based storage
 *
 * Security:
 * - Data stored in Docfai Projects directory for easy access and backup
 * - Not accessible via browser DevTools
 * - Supports optional encryption
 * - No XSS attack vector
 */
class StorageService {
  constructor() {
    // Use Docfai Projects directory for storage
    const docfaiProjectsDir = path.join(os.homedir(), 'Documents', 'Docfai Projects');

    // Ensure the directory exists
    if (!fs.existsSync(docfaiProjectsDir)) {
      fs.mkdirSync(docfaiProjectsDir, { recursive: true });
    }

    // Initialize electron-store with configuration
    this.store = new Store({
      name: 'docfai-app-store', // Name of the config file
      cwd: docfaiProjectsDir, // Store in Docfai Projects directory instead of AppData
      // Optional: Enable encryption for sensitive data
      // encryptionKey: 'your-encryption-key-here',

      // Set reasonable file size limits
      // clearInvalidConfig: true, // Clear config if it's corrupted

      // Default values
      defaults: {
        'docfai-storage': null,
        'docfai_connections': null,
        'docfai-backup-history': null,
        'docfai-backup-schedule': null,
        'docfai-account-settings': null
      },

      // Schema validation (optional but recommended)
      schema: {
        'docfai-storage': {
          type: ['object', 'null']
        },
        'docfai_connections': {
          type: ['string', 'null'] // Encrypted string
        },
        'docfai-backup-history': {
          type: ['string', 'null']
        },
        'docfai-backup-schedule': {
          type: ['string', 'null']
        },
        'docfai-account-settings': {
          type: ['string', 'null']
        }
      }
    });

    // Initialize cleanup utility
    this.cleanup = new StorageCleanup(this.store);

    // StorageService initialized

    // Analyze and report legacy data on initialization
    this.checkLegacyData();
  }

  /**
   * Check for legacy data on initialization
   */
  checkLegacyData() {
    const analysis = this.cleanup.analyzeLegacyData();

    if (analysis.hasLegacyData) {
      console.warn('[StorageService] Legacy data found in storage');
    }
  }

  /**
   * Get item from storage
   * @param {string} key - Storage key
   * @returns {string|null} - Stored value or null
   */
  getItem(key) {
    try {
      const value = this.store.get(key);

      // Return null if value doesn't exist (matching localStorage behavior)
      if (value === undefined || value === null) {
        return null;
      }

      // If value is already a string, return it
      if (typeof value === 'string') {
        return value;
      }

      // Otherwise, stringify it (matching localStorage behavior)
      return JSON.stringify(value);
    } catch (error) {
      console.error('[StorageService] Error getting item');
      return null;
    }
  }

  /**
   * Set item in storage
   * @param {string} key - Storage key
   * @param {string} value - Value to store (string)
   */
  setItem(key, value) {
    try {
      // For large values, we'll store them as-is
      // For zustand persist middleware, value is already JSON stringified

      // Try to parse as JSON to optimize storage
      // If it's valid JSON, store as object for better performance
      let valueToStore = value;
      try {
        valueToStore = JSON.parse(value);
      } catch {
        // If not valid JSON, store as string
        valueToStore = value;
      }

      this.store.set(key, valueToStore);

    } catch (error) {
      console.error('[StorageService] Error setting item');
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Remove item from storage
   * @param {string} key - Storage key
   */
  removeItem(key) {
    try {
      this.store.delete(key);
    } catch (error) {
      console.error('[StorageService] Error removing item');
    }
  }

  /**
   * Clear all storage
   */
  clear() {
    try {
      this.store.clear();
    } catch (error) {
      console.error('[StorageService] Error clearing storage');
    }
  }

  /**
   * Get all keys in storage
   * @returns {string[]} - Array of storage keys
   */
  keys() {
    try {
      // electron-store doesn't have a keys() method, so we get the entire store
      const data = this.store.store;
      return Object.keys(data);
    } catch (error) {
      console.error('[StorageService] Error getting keys');
      return [];
    }
  }

  /**
   * Get storage size in bytes
   * @returns {number} - Storage size
   */
  getSize() {
    try {
      const data = this.store.store;
      const size = JSON.stringify(data).length;
      return size;
    } catch (error) {
      console.error('[StorageService] Error getting size');
      return 0;
    }
  }

  /**
   * Get storage stats
   * @returns {object} - Storage statistics
   */
  getStats() {
    try {
      const data = this.store.store;
      const jsonString = JSON.stringify(data);
      const size = jsonString.length;
      const keys = Object.keys(data);

      return {
        size: size,
        sizeFormatted: this.formatBytes(size),
        keys: keys.length,
        path: this.store.path,
        keyDetails: keys.map(key => ({
          key,
          size: typeof data[key] === 'string' ? data[key].length : JSON.stringify(data[key]).length,
          sizeFormatted: this.formatBytes(
            typeof data[key] === 'string' ? data[key].length : JSON.stringify(data[key]).length
          )
        }))
      };
    } catch (error) {
      console.error('[StorageService] Error getting stats');
      return {
        size: 0,
        sizeFormatted: '0 B',
        keys: 0,
        path: this.store.path,
        keyDetails: []
      };
    }
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} - Formatted string (e.g., "1.5 MB")
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Migrate data from localStorage to electron-store
   * This should be called once during app startup
   * @param {object} localStorageData - Data from localStorage
   * @returns {object} - Migration result
   */
  migrateFromLocalStorage(localStorageData) {
    const migrationResult = {
      success: true,
      migratedKeys: [],
      skippedKeys: [],
      errors: [],
      totalSize: 0
    };

    try {
      for (const [key, value] of Object.entries(localStorageData)) {
        // Skip legacy keys that should not be migrated
        if (this.cleanup.shouldExcludeFromMigration(key)) {
          migrationResult.skippedKeys.push({
            key,
            reason: 'Legacy data - not migrated',
            size: value.length,
            sizeFormatted: this.formatBytes(value.length)
          });
          continue;
        }

        try {
          this.setItem(key, value);
          migrationResult.migratedKeys.push(key);
          migrationResult.totalSize += value.length;
        } catch (error) {
          migrationResult.errors.push({
            key,
            error: error.message
          });
          console.error('[StorageService] Failed to migrate key');
        }
      }

      if (migrationResult.errors.length > 0) {
        migrationResult.success = false;
      }

      return migrationResult;
    } catch (error) {
      console.error('[StorageService] Migration failed');
      return {
        success: false,
        migratedKeys: [],
        errors: [{ key: 'global', error: error.message }],
        totalSize: 0
      };
    }
  }

  /**
   * Check if storage has data
   * @returns {boolean} - True if storage has data
   */
  hasData() {
    try {
      const keys = this.keys();
      return keys.length > 0 && keys.some(key => {
        const value = this.store.get(key);
        return value !== null && value !== undefined;
      });
    } catch (error) {
      console.error('[StorageService] Error checking for data');
      return false;
    }
  }

  /**
   * Analyze legacy data in storage
   * @returns {object} - Legacy data analysis
   */
  analyzeLegacyData() {
    return this.cleanup.analyzeLegacyData();
  }

  /**
   * Clean up legacy data from storage
   * @returns {object} - Cleanup result
   */
  cleanupLegacyData() {
    return this.cleanup.cleanupLegacyData();
  }
}

// Export singleton instance
const storageService = new StorageService();
export default storageService;
