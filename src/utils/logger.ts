/**
 * Secure Logger Utility
 *
 * This utility provides logging functionality that:
 * - Only logs in development mode
 * - Sanitizes sensitive data (emails, IDs, tokens, URLs)
 * - Prevents security leaks in production builds
 * - Supports log levels to control verbosity
 *
 * Log Levels (set via localStorage.setItem('LOG_LEVEL', value)):
 * - 0: Silent (no logs)
 * - 1: Errors and warnings only (default)
 * - 2: Info, errors, and warnings
 * - 3: Verbose (all logs including debug)
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// Log levels: 0 = silent, 1 = errors/warnings only, 2 = info, 3 = verbose (all logs)
// Safe localStorage access with fallback
const getLogLevel = (): number => {
  try {
    if (typeof localStorage !== 'undefined') {
      return parseInt(localStorage.getItem('LOG_LEVEL') || '1', 10);
    }
  } catch (e) {
    // localStorage not available
  }
  return 1; // Default to errors/warnings only
};

const LOG_LEVEL = getLogLevel();

/**
 * Sanitizes sensitive data from values before logging
 */
function sanitize(value: any): any {
  if (typeof value === 'string') {
    // Redact email addresses
    value = value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

    // Redact UUIDs (user IDs, team IDs, etc.)
    value = value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID_REDACTED]');

    // Redact Supabase URLs with project identifiers
    value = value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/gi, '[SUPABASE_URL]');

    // Redact tokens (access_token, refresh_token, bearer tokens)
    value = value.replace(/(access_token|refresh_token|bearer\s+)[a-zA-Z0-9_-]+/gi, '$1[TOKEN_REDACTED]');

    return value;
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(item => sanitize(item));
    }

    const sanitized: any = {};
    for (const key in value) {
      // Skip functions
      if (typeof value[key] === 'function') {
        sanitized[key] = '[Function]';
        continue;
      }

      // Redact sensitive keys
      if (/email|token|password|secret|key|credential|auth|id$/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(value[key]);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Logger class that wraps console methods with environment checks and sanitization
 */
class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  /**
   * Log a message (only in development and if LOG_LEVEL >= 3)
   */
  log(...args: any[]): void {
    if (!isDevelopment || LOG_LEVEL < 3) return;

    const sanitizedArgs = args.map(arg => sanitize(arg));
    if (this.prefix) {
      console.log(`[${this.prefix}]`, ...sanitizedArgs);
    } else {
      console.log(...sanitizedArgs);
    }
  }

  /**
   * Log an info message (only in development and if LOG_LEVEL >= 2)
   */
  info(...args: any[]): void {
    if (!isDevelopment || LOG_LEVEL < 2) return;

    const sanitizedArgs = args.map(arg => sanitize(arg));
    if (this.prefix) {
      console.info(`[${this.prefix}]`, ...sanitizedArgs);
    } else {
      console.info(...sanitizedArgs);
    }
  }

  /**
   * Log a warning (logged if LOG_LEVEL >= 1, sanitized)
   */
  warn(...args: any[]): void {
    if (LOG_LEVEL < 1) return;

    const sanitizedArgs = args.map(arg => sanitize(arg));
    if (this.prefix) {
      console.warn(`[${this.prefix}]`, ...sanitizedArgs);
    } else {
      console.warn(...sanitizedArgs);
    }
  }

  /**
   * Log an error (logged if LOG_LEVEL >= 1, sanitized)
   */
  error(...args: any[]): void {
    if (LOG_LEVEL < 1) return;

    const sanitizedArgs = args.map(arg => sanitize(arg));
    if (this.prefix) {
      console.error(`[${this.prefix}]`, ...sanitizedArgs);
    } else {
      console.error(...sanitizedArgs);
    }
  }

  /**
   * Create a child logger with a nested prefix
   */
  child(childPrefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${childPrefix}` : childPrefix;
    return new Logger(newPrefix);
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Create a logger with a specific prefix/context
 */
export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

/**
 * Disable all logging (for testing or special cases)
 */
export function disableLogging(): void {
  // Override the isDevelopment check
  Object.assign(Logger.prototype, {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  });
}
