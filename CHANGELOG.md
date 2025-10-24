# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-10-24

### Added
- **Cleaner API** - Removed "job" from method names, focusing on tracing:
  - `trace()` - Start a new trace (replaces `traceJob()`)
  - `step()` - Add a step (replaces `traceStep()`)
  - `start()` - Start trace (replaces `startJob()`)
  - `finish(result?)` - Finish trace (replaces `finishJob()`)
  - `complete(result?)` - Complete trace (replaces `completeJob()`)
  - `fail(error)` - Fail trace (replaces `failJob()`)
  - `cancel()` - Cancel trace (replaces `cancelJob()`)
- **Full backward compatibility** - Old methods still work but are deprecated:
  - `createJob()`, `traceJob()` → `trace()`
  - `createStep()`, `traceStep()` → `step()`
  - `startJob()` → `start()`
  - `finishJob()`, `completeJob()` → `finish()` / `complete()`
  - `failJob()` → `fail()`
  - `cancelJob()` → `cancel()`

### Changed
- Migrated from `kafkajs` to `@confluentinc/kafka-javascript` for better performance
  - Higher throughput with native C/C++ librdkafka
  - Lower latency optimized for production
  - Full KafkaJS API compatibility maintained
- All type names now prefixed with `TraceFlow` for better namespace management
  - `JobStatus` → `TraceFlowJobStatus`
  - `StepStatus` → `TraceFlowStepStatus`
  - `LogLevel` → `TraceFlowLogLevel`
  - `EventType` → `TraceFlowEventType`
  - All Kafka message types similarly prefixed

### Improved
- Documentation updated with new method names and patterns
- Examples updated to showcase utility methods
- Better method naming for improved code readability

## [1.0.0] - 2025-10-24

### Added
- Initial release of TraceFlow SDK
- Complete job tracking system with auto-increment step numbers
- Support for jobs, steps, and logs
- Integrated logging with helper methods (info, warn, error, debug)
- TypeScript-first with full type definitions
- Support for both Kafka configuration and existing instance reuse
- Rich metadata support (tags, custom metadata, params, results)
- Automatic step numbering with manual override capability
