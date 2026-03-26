import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should log at info level by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger();
    logger.info('test message');
    expect(spy).toHaveBeenCalledWith('[TraceFlow:INFO] test message');
  });

  it('should not log when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ enabled: false });
    logger.info('test');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should respect minimum log level', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new Logger({ minLevel: 'warn' });

    logger.info('should be filtered');
    logger.warn('should pass');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[TraceFlow:WARN] should pass');
  });

  it('should use custom logger when provided', () => {
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = new Logger({ customLogger });

    logger.info('custom message');
    expect(customLogger.info).toHaveBeenCalledWith('custom message');
  });

  it('should log debug messages when level is debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = new Logger({ minLevel: 'debug' });
    logger.debug('debug msg');
    expect(spy).toHaveBeenCalledWith('[TraceFlow:DEBUG] debug msg');
  });

  it('should log error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger();
    logger.error('error msg');
    expect(spy).toHaveBeenCalledWith('[TraceFlow:ERROR] error msg');
  });

  it('should create scoped logger with prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger();
    const scoped = logger.scope('[HTTP]');
    scoped.info('scoped message');
    expect(spy).toHaveBeenCalledWith('[TraceFlow:INFO] [HTTP] scoped message');
  });

  it('should pass extra args to logger', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger();
    logger.info('message', { key: 'value' });
    expect(spy).toHaveBeenCalledWith('[TraceFlow:INFO] message', { key: 'value' });
  });
});
