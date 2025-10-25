# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### 1.0.5 (2025-10-25)

### Added
- **Service Integration** - Optional integration with traceflow-service for state persistence:
  - `serviceUrl` configuration option for TraceFlow Service API
  - `TraceFlowServiceClient` class for querying trace/step state
  - `initializeFromService()` method to recover step numbering after pod restart
  - `isClosedFromService()` method to check step state from persistent storage
  - `getServiceClient()` and `hasServiceClient()` methods on client
  - New example `09-state-recovery.ts` demonstrating state recovery
  - Comprehensive `SERVICE_INTEGRATION.md` guide

### Benefits
- ✅ **Pod Restart Recovery**: Resume traces after crashes
- ✅ **State Persistence**: Query trace/step state from Scylla
- ✅ **Multi-Pod Coordination**: Multiple pods can work on same trace
- ✅ **Graceful Degradation**: Works without service, falls back to in-memory

### Use Cases
- **Kubernetes**: Recover state after pod restarts/crashes
- **Distributed Systems**: Multiple services coordinating on traces
- **Long-running Jobs**: Resume after interruptions
- **State Queries**: Check trace/step status from persistent storage

---

### 1.0.4 (2025-10-25)

### Added
- **`getTrace()` method** - Retrieve existing traces by ID for cross-service workflows
  - Resume traces from different processes/services
  - `client.getTrace(jobId)` returns JobManager for existing trace
  - Example: `const trace = client.getTrace('uuid'); await trace.finish();`
- **`getStep()` method** - Retrieve existing steps by number
  - Resume work on specific steps from another service
  - `trace.getStep(stepNumber)` returns Step instance
  - Example: `const step = trace.getStep(0); await step.finish();`
- New example `08-resuming-traces.ts` demonstrating multi-service workflows
- New test `test-11-resuming-traces.ts` for getTrace/getStep functionality

### Changed
- **Method Renaming (Job → Trace)** - Cleaner API without "job" terminology:
  - `getJobId()` → `getId()` (getJobId deprecated)
  - `updateJob()` → `update()` (updateJob deprecated)
  - `getJobManager()` → `getTrace()` (getJobManager deprecated)
  - All old methods maintained as deprecated aliases for backward compatibility

### Use Cases
- **Multi-service workflows**: Order service creates trace → Warehouse service resumes and adds steps → Shipping service completes
- **Long-running jobs**: Resume traces after process restarts
- **Distributed systems**: Multiple nodes working on the same trace

---

### 1.0.3 (2025-10-24)

### Added
- **Default Topic** - Topic now defaults to `'traceflow'` if not specified
  - Simplifies initialization: just specify `brokers`
  - Can still override with custom topic if needed
- **Auto-Close Pending Steps** - When trace finishes/fails/cancels, all pending steps are automatically closed
  - Steps are closed in order by `step_number` (maintaining `updated_at` flow)
  - Prevents orphaned open steps
- **Step Class** - Object-oriented API for managing steps:
  - `step()` now returns a `Step` instance
  - Step methods: `finish()`, `complete()`, `fail()`, `update()`
  - Step logging: `step.info()`, `step.warn()`, `step.error()`, `step.debug()`
  - `getStepNumber()` - Get step number
  - `isClosed()` - Check if step is closed
- **Auto-Close Steps** - New `TraceOptions` with `autoCloseSteps`:
  - Set `autoCloseSteps: true` to automatically complete previous step when creating a new one
  - Useful for sequential workflows where you forget to close steps
  - Example: `await client.trace({ ... }, { autoCloseSteps: true })`
- New example file `step-class-usage.ts` demonstrating Step class and auto-close

### Changed
- **Breaking Change**: `step()` now returns `Step` instance instead of `number`
  - Old: `const stepNum = await trace.step({ ... })`
  - New: `const step = await trace.step({ ... })`
- `trace()` now accepts optional `TraceOptions` parameter
- `getJobManager()` now accepts optional `TraceOptions` parameter
- Legacy methods (`finishStep`, `completeStep`, `failStep`, `updateStep`) still work for backward compatibility

### Improved
- More intuitive API with fluent step management
- Better error handling with step state tracking
- Documentation updated with new Step class examples

## [1.0.2] - 2025-10-24

### Added
- **Singleton Pattern** - Now you can initialize once and use everywhere:
  - `initializeTraceFlow(config, source?)` - Initialize the singleton
  - `getTraceFlow()` - Get the singleton instance from anywhere
  - `hasTraceFlow()` - Check if initialized
  - `resetTraceFlow()` - Reset singleton (useful for testing)
- New example file `singleton-usage.ts` demonstrating the singleton pattern
- Static methods on `TraceFlowClient`:
  - `TraceFlowClient.initialize()`
  - `TraceFlowClient.getInstance()`
  - `TraceFlowClient.hasInstance()`
  - `TraceFlowClient.reset()`

### Improved
- Documentation updated with singleton pattern as recommended approach
- Better organization for multi-module applications
- Simplified setup for most use cases

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
