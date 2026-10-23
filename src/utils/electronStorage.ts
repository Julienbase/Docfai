/**
 * Electron Storage Adapter
 *
 * Provides a localStorage-compatible interface that uses electron-store via IPC.
 * This resolves QuotaExceededError by using file-based storage instead of browser storage.
 *
 * Features:
 * - Automatic migration from localStorage to electron-store on first use
 * - Transparent fallback to localStorage if electron-store is unavailable
 * - Same API as localStorage for drop-in replacement
 * - No breaking changes required
 *
 * Usage:
 * Replace localStorage with electronStorage in your code:
 *
 * Before: localStorage.setItem('key', 'value')
 * After:  electronStorage.setItem('key', 'value')
 *
 * Or use the createElectronStorage() function for Zustand persist middleware
 */

import { createLogger } from './logger';

const logger = createLogger('ElectronStorage');

interface StorageStats {
  size: number;
  sizeFormatted: string;
  keys: number;
  path: string;
  keyDetails: Array<{
    key: string;
    size: number;
    sizeFormatted: string;
  }>;
}

class ElectronStorage implements Storage {
  private isElectron: boolean = false;
  private migrationComplete: boolean = false;
  private migrationInProgress: boolean = false;
  private cache: Map<string, string> = new Map();
  private useFallback: boolean = false;

  constructor() {
    // Check if we're running in Electron
    this.isElectron = typeof window !== 'undefined' &&
                      window.electronAPI !== undefined;

    if (this.isElectron) {
      logger.log('Initializing in Electron environment');
      // Initialize migration asynchronously
      this.initializeMigration().catch(error => {
        logger.error('Migration initialization failed:', error);
        this.useFallback = true;
      });
    } else {
      this.useFallback = true;
    }
  }

  /**
   * Initialize storage and perform migration if needed
   */
  private async initializeMigration(): Promise<void> {
    if (this.migrationComplete || this.migrationInProgress) {
      return;
    }

    this.migrationInProgress = true;

    try {
      // Check if electron-store already has data
      const hasData = await window.electronAPI.ipcInvoke('storage-has-data');

      if (hasData.success && hasData.hasData) {
        logger.log('electron-store already has data, skipping migration');

        // CRITICAL FIX: Load existing data from electron-store into cache
        // This ensures the cache is populated on app restart
        await this.loadExistingDataIntoCache();

        this.migrationComplete = true;
        this.migrationInProgress = false;
        return;
      }

      // Check if localStorage has data to migrate
      const localStorageData: Record<string, string> = {};
      let hasLocalStorageData = false;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            localStorageData[key] = value;
            hasLocalStorageData = true;
          }
        }
      }

      if (hasLocalStorageData) {
        logger.log(`Found localStorage data, migrating ${Object.keys(localStorageData).length} keys to electron-store`);

        // Perform migration
        const result = await window.electronAPI.ipcInvoke('storage-migrate-from-localstorage', localStorageData);

        if (result.success && result.migrationResult) {
          const { migratedKeys, errors } = result.migrationResult;
          logger.log(`Migration complete: ${migratedKeys.length} keys migrated`);

          if (errors.length > 0) {
            logger.warn(`Migration had ${errors.length} errors`, errors);
          }
        } else {
          logger.error('Migration failed:', result.error);
          this.useFallback = true;
        }
      }

      this.migrationComplete = true;
    } catch (error) {
      logger.error('Migration error:', error);
      this.useFallback = true;
    } finally {
      this.migrationInProgress = false;
    }
  }

  /**
   * Load existing data from electron-store into cache
   * CRITICAL: This is called on app restart to populate the cache with persisted data
   */
  private async loadExistingDataIntoCache(): Promise<void> {
    try {
      logger.log('📥 Loading existing data from electron-store into cache...');

      // Get all keys from electron-store
      const keysResult = await window.electronAPI.ipcInvoke('storage-keys');
      if (!keysResult.success || !keysResult.keys) {
        logger.warn('⚠️ Failed to get keys from electron-store');
        return;
      }

      const keys = keysResult.keys;
      logger.log(`🔍 Found ${keys.length} keys in electron-store`);

      // Load all values into cache
      let loadedCount = 0;
      for (const key of keys) {
        const result = await window.electronAPI.ipcInvoke('storage-get-item', key);
        if (result.success && result.value !== null) {
          this.cache.set(key, result.value);
          loadedCount++;
        }
      }

      logger.log(`✅ Loaded ${loadedCount} items from electron-store into cache`);
    } catch (error) {
      logger.error('❌ Error loading data from electron-store:', error);
      // Don't throw - we can still use localStorage as fallback
    }
  }

  /**
   * Wait for migration to complete
   */
  private async waitForMigration(): Promise<void> {
    if (this.migrationComplete) {
      return;
    }

    // Wait for migration to complete (max 5 seconds)
    const maxWait = 5000;
    const startTime = Date.now();

    while (this.migrationInProgress && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.migrationComplete && !this.useFallback) {
      // Migration didn't complete in time, use fallback
      logger.warn('Migration timeout, using localStorage fallback');
      this.useFallback = true;
    }
  }

  /**
   * Get item from storage
   */
  getItem(key: string): string | null {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      return localStorage.getItem(key);
    }

    // Check cache first - cache is the source of truth after migration
    if (this.cache.has(key)) {
      const value = this.cache.get(key) || null;
      logger.log(`✅ [getItem] Found "${key.substring(0, 30)}" in cache (${value ? value.length : 0} bytes)`);
      return value;
    }

    // Synchronous fallback to localStorage during migration
    if (this.migrationInProgress) {
      const value = localStorage.getItem(key);
      logger.log(`⏳ [getItem] Migration in progress, reading "${key.substring(0, 30)}" from localStorage (${value ? value.length : 0} bytes)`);
      return value;
    }

    // CRITICAL FIX: After migration completes, load from electron-store synchronously
    // We need to use localStorage as a temporary source while we populate the cache
    // This prevents returning null which would cause Zustand to initialize with empty state
    logger.log(`🔍 [getItem] Cache miss for "${key.substring(0, 30)}", loading from electron-store...`);

    // Trigger async fetch to populate cache for next time
    this.fetchItem(key);

    // IMPORTANT: Return data from localStorage as fallback while cache is being populated
    // This ensures data is available immediately on app restart
    // localStorage still has the migrated data from previous session
    const fallbackValue = localStorage.getItem(key);
    if (fallbackValue) {
      logger.log(`📦 [getItem] Using localStorage fallback for "${key.substring(0, 30)}" (${fallbackValue.length} bytes)`);
    }
    return fallbackValue;
  }

  /**
   * Fetch item asynchronously and update cache
   * CRITICAL: Only update cache if it's empty to prevent overwriting newer data
   */
  private async fetchItem(key: string): Promise<void> {
    try {
      const result = await window.electronAPI.ipcInvoke('storage-get-item', key);
      if (result.success && result.value !== null) {
        // CRITICAL FIX: Don't overwrite cache if it already has a value
        // This prevents stale electron-store data from overwriting fresh localStorage data
        if (!this.cache.has(key)) {
          logger.log(`📥 [fetchItem] Loaded "${key.substring(0, 30)}" from electron-store into cache`);
          this.cache.set(key, result.value);
        } else {
          logger.log(`⏭️  [fetchItem] Skipping cache update for "${key.substring(0, 30)}" - cache already has newer value`);
        }
      }
    } catch (error) {
      logger.error('Error fetching item:', error);
    }
  }

  /**
   * Set item in storage
   */
  setItem(key: string, value: string): void {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      localStorage.setItem(key, value);
      return;
    }

    // Update cache immediately
    this.cache.set(key, value);

    // CRITICAL FIX: ALWAYS update localStorage as backup
    // This ensures data is available on next app restart even if electron-store fails
    // localStorage is used as fallback when cache is empty on startup
    localStorage.setItem(key, value);

    // Update electron-store asynchronously
    this.setItemAsync(key, value);
  }

  /**
   * Set item asynchronously in electron-store
   */
  private async setItemAsync(key: string, value: string): Promise<void> {
    try {
      await this.waitForMigration();
      const result = await window.electronAPI.ipcInvoke('storage-set-item', key, value);

      if (!result.success) {
        logger.error('Failed to set item:', result.error);
        // Fallback to localStorage
        localStorage.setItem(key, value);
      } else {
        logger.log('Successfully saved to electron-store:', key.substring(0, 30));
      }
    } catch (error) {
      logger.error('Error setting item:', error);
      // Fallback to localStorage
      localStorage.setItem(key, value);
    }
  }

  /**
   * Force immediate flush of all pending writes to disk
   * Call this before app quits to ensure data persistence
   */
  async flush(): Promise<void> {
    if (!this.isElectron || this.useFallback) {
      return;
    }

    try {
      logger.log(`🔄 [flush] Flushing ${this.cache.size} items from cache to electron-store...`);

      // Wait for any pending async operations
      await this.waitForMigration();

      // Force write all cached data to electron-store (the JSON file)
      // This writes to C:\Users\...\Documents\Docfai Projects\docfai-app-store.json
      const writePromises = Array.from(this.cache.entries()).map(([key, value]) => {
        logger.log(`💾 [flush] Writing "${key.substring(0, 30)}" to electron-store (${value.length} bytes)`);
        return window.electronAPI.ipcInvoke('storage-set-item', key, value);
      });

      await Promise.all(writePromises);
      logger.log('✅ [flush] Storage flushed successfully to electron-store JSON file');
    } catch (error) {
      logger.error('❌ [flush] Error flushing storage:', error);
    }
  }

  /**
   * Remove item from storage
   */
  removeItem(key: string): void {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      localStorage.removeItem(key);
      return;
    }

    // Remove from cache
    this.cache.delete(key);

    // CRITICAL FIX: ALWAYS remove from localStorage as backup
    // This keeps localStorage in sync with cache and electron-store
    localStorage.removeItem(key);

    // Remove from electron-store asynchronously
    this.removeItemAsync(key);
  }

  /**
   * Remove item asynchronously from electron-store
   */
  private async removeItemAsync(key: string): Promise<void> {
    try {
      await this.waitForMigration();
      const result = await window.electronAPI.ipcInvoke('storage-remove-item', key);

      if (!result.success) {
        logger.error('Failed to remove item:', result.error);
      }
    } catch (error) {
      logger.error('Error removing item:', error);
    }
  }

  /**
   * Clear all storage
   */
  clear(): void {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      localStorage.clear();
      return;
    }

    // Clear cache
    this.cache.clear();

    // CRITICAL FIX: ALWAYS clear localStorage as backup
    // This keeps localStorage in sync with cache and electron-store
    localStorage.clear();

    // Clear electron-store asynchronously
    this.clearAsync();
  }

  /**
   * Clear storage asynchronously
   */
  private async clearAsync(): Promise<void> {
    try {
      await this.waitForMigration();
      const result = await window.electronAPI.ipcInvoke('storage-clear');

      if (!result.success) {
        logger.error('Failed to clear storage:', result.error);
      }
    } catch (error) {
      logger.error('Error clearing storage:', error);
    }
  }

  /**
   * Get key at index
   */
  key(index: number): string | null {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      return localStorage.key(index);
    }

    // Use localStorage during migration
    if (this.migrationInProgress) {
      return localStorage.key(index);
    }

    // For electron-store, we need to fetch keys asynchronously
    // Return null for now and fetch in background
    this.fetchKeys();
    return localStorage.key(index); // Fallback
  }

  /**
   * Fetch keys asynchronously
   */
  private async fetchKeys(): Promise<string[]> {
    try {
      const result = await window.electronAPI.ipcInvoke('storage-keys');
      if (result.success) {
        return result.keys;
      }
      return [];
    } catch (error) {
      logger.error('Error fetching keys:', error);
      return [];
    }
  }

  /**
   * Get number of items in storage
   */
  get length(): number {
    // Use fallback if needed
    if (this.useFallback || !this.isElectron) {
      return localStorage.length;
    }

    // Use localStorage during migration
    if (this.migrationInProgress) {
      return localStorage.length;
    }

    // For electron-store, return cache size or fetch asynchronously
    return this.cache.size || localStorage.length;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats | null> {
    if (!this.isElectron || this.useFallback) {
      return null;
    }

    try {
      const result = await window.electronAPI.ipcInvoke('storage-get-stats');
      if (result.success) {
        return result.stats;
      }
      return null;
    } catch (error) {
      logger.error('Error getting stats:', error);
      return null;
    }
  }

  /**
   * Check if migration is complete
   */
  isMigrationComplete(): boolean {
    return this.migrationComplete;
  }

  /**
   * Check if using fallback (localStorage)
   */
  isUsingFallback(): boolean {
    return this.useFallback;
  }
}

// Create singleton instance
const electronStorage = new ElectronStorage();

/**
 * Create a storage adapter for Zustand persist middleware
 * This provides a drop-in replacement for localStorage
 * Returns a StateStorage object that can be used with createJSONStorage
 */
export function createElectronStorage() {
  return {
    getItem: (name: string): string | null | Promise<string | null> => {
      return electronStorage.getItem(name);
    },
    setItem: (name: string, value: string): void | Promise<void> => {
      electronStorage.setItem(name, value);
    },
    removeItem: (name: string): void | Promise<void> => {
      electronStorage.removeItem(name);
    },
  };
}

/**
 * Force flush all pending writes to disk
 * Call this before app quits to ensure data persistence
 */
export async function flushElectronStorage(): Promise<void> {
  await electronStorage.flush();
}

// Export the singleton instance
export default electronStorage;

// Export type for TypeScript
export type { StorageStats };
