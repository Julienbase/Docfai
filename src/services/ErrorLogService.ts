/**
 * Error Log Service
 *
 * Captures and stores error logs from the renderer process for troubleshooting.
 * Only captures console.error() calls and unhandled errors.
 * Limited to 100 most recent errors to prevent memory issues.
 */

interface ErrorLogEntry {
  timestamp: string;
  level: 'error';
  source: string;
  message: string;
  stack?: string;
}

class ErrorLogService {
  private maxLogs = 100;
  private logs: ErrorLogEntry[] = [];
  private initialized = false;

  /**
   * Initialize the error log service
   * Hooks into console.error and global error handlers
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Capture console.error calls
    const originalError = console.error;
    console.error = (...args: any[]) => {
      // Call original console.error first
      originalError.apply(console, args);

      // Capture the error
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'console.error',
        message: args.map(arg => this.stringify(arg)).join(' ')
      });
    };

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'unhandledRejection',
        message: `Unhandled Promise Rejection: ${this.stringify(event.reason)}`,
        stack: event.reason?.stack
      });
    });

    // Capture global errors
    window.addEventListener('error', (event) => {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'globalError',
        message: event.message || String(event.error),
        stack: event.error?.stack
      });
    });
  }

  /**
   * Add a log entry (keeps only the most recent maxLogs entries)
   */
  private addLog(entry: ErrorLogEntry) {
    this.logs.push(entry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Convert any value to a string for logging
   */
  private stringify(value: any): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.message}\n${value.stack || ''}`;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Get all captured error logs
   */
  getLogs(): ErrorLogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Get logs formatted as text
   */
  getLogsAsText(): string {
    if (this.logs.length === 0) {
      return 'No errors captured yet.';
    }

    return this.logs.map(log => {
      let entry = `[${log.timestamp}] [${log.source}] ${log.message}`;
      if (log.stack) {
        entry += `\nStack trace:\n${log.stack}`;
      }
      return entry;
    }).join('\n\n' + '-'.repeat(80) + '\n\n');
  }
}

// Export singleton instance
export const errorLogService = new ErrorLogService();
