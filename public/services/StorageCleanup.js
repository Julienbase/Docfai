/**
 * Storage Cleanup Utility
 *
 * Removes legacy data from storage that's no longer needed:
 * - Excalidraw libraries (from when Excalidraw was in the app)
 * - Other deprecated storage keys
 *
 * This utility can be run manually via IPC or automatically on app startup
 */

class StorageCleanup {
  constructor(store) {
    this.store = store;

    // List of legacy keys to remove
    this.legacyKeys = [
      'excalidraw-libraries',  // Old Excalidraw library data
      'excalidraw',            // Generic Excalidraw data
      'EXCALIDRAW_STATE',      // Excalidraw state
      'collab-scenes',         // Excalidraw collaboration scenes
      // Add more legacy keys here as needed
    ];
  }

  /**
   * Check if storage contains any legacy data
   * @returns {object} - Analysis of legacy data
   */
  analyzeLegacyData() {
    const data = this.store.store;
    const legacyData = {};
    let totalLegacySize = 0;

    for (const key of this.legacyKeys) {
      if (data[key] !== undefined) {
        const value = data[key];
        const size = typeof value === 'string' ? value.length : JSON.stringify(value).length;

        legacyData[key] = {
          exists: true,
          size: size,
          sizeFormatted: this.formatBytes(size),
          type: typeof value
        };

        totalLegacySize += size;
      }
    }

    return {
      hasLegacyData: Object.keys(legacyData).length > 0,
      legacyKeys: legacyData,
      totalLegacySize: totalLegacySize,
      totalLegacySizeFormatted: this.formatBytes(totalLegacySize),
      keysFound: Object.keys(legacyData)
    };
  }

  /**
   * Remove all legacy data from storage
   * @returns {object} - Cleanup result
   */
  cleanupLegacyData() {
    const analysis = this.analyzeLegacyData();

    if (!analysis.hasLegacyData) {
      return {
        success: true,
        removed: [],
        spaceFreed: 0,
        message: 'No legacy data found'
      };
    }

    const removed = [];
    let spaceFreed = 0;

    // Remove each legacy key
    for (const key of analysis.keysFound) {
      try {
        const size = analysis.legacyKeys[key].size;
        this.store.delete(key);
        removed.push({
          key: key,
          size: size,
          sizeFormatted: this.formatBytes(size)
        });
        spaceFreed += size;
      } catch (error) {
        console.error('[StorageCleanup] Failed to remove legacy key');
      }
    }

    return {
      success: true,
      removed: removed,
      spaceFreed: spaceFreed,
      spaceFreedFormatted: this.formatBytes(spaceFreed),
      message: `Removed ${removed.length} legacy keys, freed ${this.formatBytes(spaceFreed)}`
    };
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} - Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Should exclude key from migration
   * @param {string} key - Storage key
   * @returns {boolean} - True if key should be excluded
   */
  shouldExcludeFromMigration(key) {
    return this.legacyKeys.includes(key);
  }
}

export default StorageCleanup;
