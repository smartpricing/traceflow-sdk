# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.2.1 (2025-11-13)

### 🐛 Bug Fixes

#### Data Preservation on Close Operations
- **Fixed:** All close operations now preserve complete data when sending final Kafka messages
  - Previously, closing steps/traces only sent minimal fields to Kafka
  - Lost important data: `step_id`, `name`, `step_type`, `input`, `metadata`, `trace_type`, `title`, `description`, etc.
  - Now retrieves existing state from Redis before closing
  - All fields are preserved in both Kafka messages and Redis state

#### Step Close Operations
- **Affected Methods:**
  - `Step.complete()` - Now retrieves and preserves all existing fields
  - `Step.fail()` - Now retrieves and preserves all existing fields
- **Auto-Close Steps:**
  - When `autoCloseSteps: true`, previous step is closed with all data preserved
  - Manual step completion also preserves all fields

#### Trace Close Operations
- **Affected Methods:**
  - `TraceManager.complete()` - Now retrieves and preserves all existing trace fields
  - `TraceManager.fail()` - Now retrieves and preserves all existing trace fields
  - `TraceManager.cancel()` - Now retrieves and preserves all existing trace fields

### 🔧 Technical Details
- Modified all close methods to retrieve state from Redis before sending Kafka message
- Added field preservation using spread operator to maintain all existing data
- **Behavior:**
  - If Redis is available: Retrieves full state and includes all fields in Kafka message
  - If Redis is not available: Falls back to basic fields only (as before)
- Enhanced logging for better debugging
- No breaking changes to public API

## 1.2.0 (2025-11-05)


### Features

* Add traceflow: prefix to all Redis keys ([425d93a](https://github.com-sp/smartpricing/traceflow-sdk/commit/425d93a17eb1e1d8abfa403f8233e6653122ab04))

## 1.1.1 (2025-11-05)

### 🔧 Improvements

#### Redis Key Prefix
- **Added `traceflow:` prefix to all Redis keys**
  - Prevents collisions with other applications sharing the same Redis instance
  - Keys now follow pattern: `traceflow:trace:<id>`, `traceflow:traces:activity`, etc.
  - Updated documentation with complete key structure reference

### 📚 Documentation
- **[SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md)** - Added Redis Key Structure section
  - Key patterns and examples
  - Commands for inspecting Redis data
  - Best practices for Redis usage

## 1.1.0 (2025-11-05)

### Features

* Add state validation, duplicate prevention, and custom error classes ([e94b6f5](https://github.com-sp/smartpricing/traceflow-sdk/commit/e94b6f5b1b877856c212a5fed742eed1b130093a))

## 1.0.11 (2025-11-05)

### 🎉 New Features

#### State Validation & Error Handling
- **Custom Error Classes:** Added comprehensive error handling with specific error types
  - `TraceClosedError` - Thrown when attempting operations on closed traces
  - `StepClosedError` - Thrown when attempting operations on closed steps
  - `DuplicateError` - Thrown when duplicate prevention detects duplicates
  - `ClientNotInitializedError` - Thrown when using uninitialized singleton
  - `RedisNotConfiguredError` - Thrown when Redis is required but not configured
  - `InvalidStateTransitionError` - Thrown for invalid state transitions

- **State Validation:** Automatic validation prevents invalid operations
  - Cannot add steps to completed/failed/cancelled traces
  - Cannot update/complete/fail closed steps
  - Real-time status tracking for traces and steps
  - Protection against race conditions in distributed systems

#### Duplicate Prevention
- **`preventDuplicates` Option:** New configuration flag for duplicate detection
  - When `false` (default): New data overwrites existing data
  - When `true`: Throws `DuplicateError` for closed traces/steps
  - Allows updates to active traces (PENDING/RUNNING)
  - Allows updates to open steps (STARTED/IN_PROGRESS)
  - Requires Redis for duplicate detection

### 📚 Documentation
- **[ERROR_HANDLING.md](./ERROR_HANDLING.md)** - Comprehensive error handling guide
  - Complete error class reference
  - Duplicate prevention examples
  - State validation best practices
  - Idempotent operation patterns

- **Updated README.md**
  - Added duplicate prevention examples
  - Enhanced feature list
  - Better organized documentation links

### 🔧 Internal Improvements
- Enhanced logging for duplicate detection
- Better state tracking in TraceManager and Step classes
- Improved TypeScript types for error handling

### 🔒 Data Integrity
- Prevents accidental data overwrites when enabled
- Ensures traces cannot be modified after completion
- Protects against concurrent modification issues

### 1.0.10 (2025-11-05)

### Bug Fixes

* move brokers to kafkaJS block - all Kafka properties now in kafkaJS namespace ([ebf829b](https://github.com-sp/smartpricing/traceflow-sdk/commit/ebf829b0bca679d233d2f8bcc9846cca0b8d0833))

### 1.0.9 (2025-11-05)

### 1.0.8 (2025-11-05)

## [1.0.0] - 2025-01-XX

**First major release** - Complete refactoring with Redis state persistence

### Breaking Changes

#### 🔄 Terminology Refactoring
- **Complete migration from "Job" to "Trace" terminology**
  - `JobManager` → `TraceManager`
  - `TraceFlowJobStatus` → `TraceFlowTraceStatus`
  - `CreateJobOptions` → `CreateTraceOptions`
  - `UpdateJobOptions` → `UpdateTraceOptions`
  - `TraceFlowKafkaJobMessage` → `TraceFlowKafkaTraceMessage`
  - All `job_id` fields → `trace_id` in Kafka messages
  - All `job_type` fields → `trace_type` in Kafka messages
- **File renames**
  - `src/job-manager.ts` → `src/trace-manager.ts`

#### 🔴 State Persistence Architecture Change
- **Removed:** HTTP API integration (`serviceUrl`)
  - Deleted `TraceFlowServiceClient` class
  - Removed HTTP endpoint dependencies
  - Removed service URL configuration
  
- **Added:** Redis integration for state persistence
  - New configuration: `redisUrl` or `redisClient`
  - New class: `TraceFlowRedisClient`
  - Automatic state persistence on every operation
  - Efficient activity tracking using Redis sorted sets
  
- **Method renames:**
  - `initializeFromService()` → `initializeFromRedis()`
  - `getServiceClient()` → `getRedisClient()`
  - `hasServiceClient()` → `hasRedisClient()`
  - `isClosedFromService()` → `isClosedFromRedis()`

#### 🧹 TraceCleaner Configuration Change
- **Before:** Required service URL
  ```typescript
  cleanerConfig: { serviceClient: 'http://...' }
  ```
- **After:** Requires Redis client
  ```typescript
  cleanerConfig: { /* uses redisClient from main config */ }
  ```
- Now queries Redis directly for inactive traces
- More efficient using Redis sorted sets

#### ❌ Removed All Deprecated Methods
First clean version with no backward compatibility:
- `traceJob()`, `createJob()`, `getJobManager()` 
- `getJobId()`, `updateJob()`, `startJob()`, `finishJob()`, `completeJob()`, `failJob()`, `cancelJob()`
- `traceStep()`, `createStep()`, `updateStep()`, `finishStep()`, `completeStep()`, `failStep()`

### Added

#### ✨ Redis State Persistence
- **Automatic state sync** to Redis on every trace/step operation
- **Pod restart recovery** - Resume traces after crashes
- **Configurable Redis connection**:
  - `redisUrl`: Connection string
  - `redisClient`: Existing Redis client instance
- **State recovery methods**:
  - `trace.initializeFromRedis()` - Recover step numbers
  - `redisClient.getTrace(id)` - Query trace state
  - `redisClient.getSteps(id)` - Query all steps
  - `redisClient.getStep(id, num)` - Query specific step

#### 🧹 Enhanced TraceCleaner
- **Redis-based queries** for inactive traces
- **Configurable timeouts**:
  - `inactivityTimeoutSeconds` (default: 1800 = 30 min)
  - `cleanupIntervalSeconds` (default: 300 = 5 min)
- **Automatic start option**: `autoStart: true`
- **Custom logger support**
- **Activity tracking** using Redis sorted sets

#### 📊 Comprehensive Logging
- Detailed logs throughout SDK for debugging
- **Log prefixes** for easy filtering:
  - `[TraceFlow Client]` - Client operations
  - `[TraceFlow Redis]` - Redis operations
  - `[TraceManager {id}]` - Trace operations
  - `[Step {id}:{num}]` - Step operations
  - `[TraceCleaner]` - Cleanup operations
- **Status indicators**: ✅ success, ⚠️ warning, ❌ error

#### 🎯 Activity Tracking
- **`last_activity_at` field** automatically tracked
- Updated on every trace/step operation
- Used by TraceCleaner for inactivity detection
- Persisted in Redis and sent via Kafka

### Changed

#### 📝 Default Topic
- Topic now defaults to `'traceflow'` if not specified
- Simplifies configuration

#### 🔄 Auto-Close Pending Steps
- When trace completes/fails/cancels, all pending steps auto-close
- Maintains correct `updated_at` flow
- Prevents orphaned open steps

#### 📦 Step Class Enhancements
- `step()` returns `Step` instance
- Step methods: `finish()`, `complete()`, `fail()`, `update()`
- Step logging: `info()`, `warn()`, `error()`, `debug()`
- State management: `getStepNumber()`, `isClosed()`

#### ⚡ Auto-Close Steps Option
- New `TraceOptions`: `autoCloseSteps`
- Automatically closes previous step when creating new one
- Perfect for sequential workflows

### Documentation

#### 📚 Updated Documentation
- **README.md** - Added Redis examples and configuration
- **SERVICE_INTEGRATION.md** - Completely rewritten for Redis architecture
- **SUMMARY.md** - Updated for v1.0.0
- **CHANGELOG.md** - This file

### Dependencies

#### 📦 New Dependencies
- `redis` ^4.7.0 - Redis client for state persistence

### Migration Guide

#### From SDK without Redis

1. Add Redis configuration:
```typescript
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379', // Add this
});
```

2. No code changes needed - automatic persistence!

3. To resume traces after restart:
```typescript
const trace = client.getTrace(savedTraceId);
await trace.initializeFromRedis();
```

#### From SDK with serviceUrl

1. Replace `serviceUrl` with `redisUrl`:
```typescript
// Before
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  serviceUrl: 'http://traceflow-service:3000',
});

// After
const client = new TraceFlowClient({
  brokers: ['localhost:9092'],
  redisUrl: 'redis://localhost:6379',
});
```

2. Update method calls:
- `initializeFromService()` → `initializeFromRedis()`
- `getServiceClient()` → `getRedisClient()`
- `hasServiceClient()` → `hasRedisClient()`

3. Update TraceCleaner if used - it now uses Redis automatically

### Architecture

```
┌─────────────────┐
│   Your Service  │
│   (SDK Client)  │
└────────┬────────┘
         │
         ├──► Kafka Topic 'traceflow'
         │    (events)
         │
         └──► Redis
              (state persistence)
              
                    ↓
              
         ┌──────────────────┐
         │ TraceFlow Service│
         │ (Kafka Consumer) │
         └────────┬─────────┘
                  │
                  └──► ScyllaDB
                       (historical data)
```

**Key Points:**
- SDK sends events to Kafka (for processing)
- SDK persists state to Redis (for recovery)
- TraceFlow Service consumes Kafka → writes to ScyllaDB
- TraceCleaner queries Redis → closes inactive traces

### Benefits

| Feature | Without Redis | With Redis |
|---------|--------------|------------|
| State persistence | ❌ | ✅ |
| Pod restart recovery | ❌ | ✅ |
| Query trace state | ❌ | ✅ |
| Auto cleanup | ❌ | ✅ |
| Multi-pod coordination | ❌ | ✅ |
| Step number recovery | ❌ | ✅ |

---

## Previous Versions

All previous versions (1.0.1 - 1.0.7) were pre-release development versions.  
This is the first official stable release.
