package traceflow

import (
	"fmt"
	"log"
	"strings"
)

// Logger is the minimal logging surface used internally by the SDK. Provide a
// custom implementation via Config.Logger to integrate with your logging stack.
type Logger interface {
	Debug(format string, args ...any)
	Info(format string, args ...any)
	Warn(format string, args ...any)
	Error(format string, args ...any)
}

type logLevel int

const (
	levelDebug logLevel = iota
	levelInfo
	levelWarn
	levelError
)

func parseLevel(s string) logLevel {
	switch strings.ToLower(s) {
	case "debug":
		return levelDebug
	case "warn":
		return levelWarn
	case "error":
		return levelError
	default:
		return levelInfo
	}
}

// stdLogger is the default Logger; it writes level-prefixed lines to the
// standard library logger and filters by minimum level.
type stdLogger struct {
	enabled  bool
	minLevel logLevel
	prefix   string
}

func newStdLogger(enabled bool, minLevel string) *stdLogger {
	return &stdLogger{enabled: enabled, minLevel: parseLevel(minLevel)}
}

func (l *stdLogger) emit(level logLevel, tag, format string, args ...any) {
	if !l.enabled || level < l.minLevel {
		return
	}
	msg := fmt.Sprintf(format, args...)
	if l.prefix != "" {
		log.Printf("[TraceFlow:%s] %s %s", tag, l.prefix, msg)
		return
	}
	log.Printf("[TraceFlow:%s] %s", tag, msg)
}

func (l *stdLogger) Debug(format string, args ...any) { l.emit(levelDebug, "DEBUG", format, args...) }
func (l *stdLogger) Info(format string, args ...any)  { l.emit(levelInfo, "INFO", format, args...) }
func (l *stdLogger) Warn(format string, args ...any)  { l.emit(levelWarn, "WARN", format, args...) }
func (l *stdLogger) Error(format string, args ...any) { l.emit(levelError, "ERROR", format, args...) }

// scope returns a logger that prefixes every message, mirroring the JS SDK's
// scoped loggers (e.g. "HTTP").
func (l *stdLogger) scope(prefix string) *stdLogger {
	clone := *l
	clone.prefix = strings.TrimSpace(l.prefix + " " + prefix)
	return &clone
}

// noopLogger discards everything; used as a safe fallback.
type noopLogger struct{}

func (noopLogger) Debug(string, ...any) {}
func (noopLogger) Info(string, ...any)  {}
func (noopLogger) Warn(string, ...any)  {}
func (noopLogger) Error(string, ...any) {}
