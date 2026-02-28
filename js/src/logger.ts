/**
 * Internal Logger for TraceFlow SDK
 * Configurable logging system with level-based filtering
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerConfig {
  enabled?: boolean;
  minLevel?: LogLevel;
  customLogger?: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
}

/**
 * Logger class for SDK internal logging
 */
export class Logger {
  private enabled: boolean;
  private minLevel: number;
  private customLogger?: LoggerConfig['customLogger'];

  constructor(config: LoggerConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.minLevel = LOG_LEVELS[config.minLevel || 'info'];
    this.customLogger = config.customLogger;
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void {
    if (!this.enabled || this.minLevel > LOG_LEVELS.debug) return;
    
    if (this.customLogger?.debug) {
      this.customLogger.debug(message, ...args);
    } else {
      console.debug(`[TraceFlow:DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log info message
   */
  info(message: string, ...args: any[]): void {
    if (!this.enabled || this.minLevel > LOG_LEVELS.info) return;
    
    if (this.customLogger?.info) {
      this.customLogger.info(message, ...args);
    } else {
      console.log(`[TraceFlow:INFO] ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    if (!this.enabled || this.minLevel > LOG_LEVELS.warn) return;
    
    if (this.customLogger?.warn) {
      this.customLogger.warn(message, ...args);
    } else {
      console.warn(`[TraceFlow:WARN] ${message}`, ...args);
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: any[]): void {
    if (!this.enabled || this.minLevel > LOG_LEVELS.error) return;
    
    if (this.customLogger?.error) {
      this.customLogger.error(message, ...args);
    } else {
      console.error(`[TraceFlow:ERROR] ${message}`, ...args);
    }
  }

  /**
   * Create a scoped logger with a prefix
   */
  scope(prefix: string): ScopedLogger {
    return new ScopedLogger(this, prefix);
  }
}

/**
 * Scoped logger with automatic prefix
 */
class ScopedLogger {
  constructor(
    private logger: Logger,
    private prefix: string
  ) {}

  debug(message: string, ...args: any[]): void {
    this.logger.debug(`${this.prefix} ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(`${this.prefix} ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(`${this.prefix} ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(`${this.prefix} ${message}`, ...args);
  }
}

