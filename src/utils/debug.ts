/**
 * Debug utility for conditional logging
 * Only logs when DEBUG environment variable is set to 'true'
 */

// Check if debug mode is enabled
const isDebugEnabled = (): boolean => {
  // In browser environment, check for localStorage or URL params
  if (typeof window !== 'undefined') {
    // Check localStorage first
    const debugFromStorage = localStorage.getItem('DEBUG');
    if (debugFromStorage === 'true') return true;
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') return true;
  }
  
  // In Node.js environment, check process.env
  if (typeof process !== 'undefined' && process.env) {
    return process.env.DEBUG === 'true';
  }
  
  return false;
};

/**
 * Conditional debug logger
 * Only logs when debug mode is enabled
 */
export const debugLog = (...args: any[]): void => {
  if (isDebugEnabled()) {
    console.log('[DEBUG]', ...args);
  }
};

/**
 * Conditional debug logger with custom prefix
 */
export const debugLogWithPrefix = (prefix: string, ...args: any[]): void => {
  if (isDebugEnabled()) {
    console.log(`[${prefix}]`, ...args);
  }
};

/**
 * Conditional debug error logger
 */
export const debugError = (...args: any[]): void => {
  if (isDebugEnabled()) {
    console.error('[DEBUG-ERROR]', ...args);
  }
};

/**
 * Conditional debug warn logger
 */
export const debugWarn = (...args: any[]): void => {
  if (isDebugEnabled()) {
    console.warn('[DEBUG-WARN]', ...args);
  }
};

/**
 * Check if debug mode is currently enabled
 */
export const isDebugMode = isDebugEnabled;

/**
 * Enable debug mode (browser only)
 */
export const enableDebugMode = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('DEBUG', 'true');
    console.log('Debug mode enabled. Refresh the page to see debug logs.');
  }
};

/**
 * Disable debug mode (browser only)
 */
export const disableDebugMode = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('DEBUG');
    console.log('Debug mode disabled. Refresh the page to hide debug logs.');
  }
};