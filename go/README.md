# TraceFlow SDK for Go

[![Go SDK CI](https://github.com/smartpricing/traceflow-sdk/actions/workflows/go-ci.yml/badge.svg)](https://github.com/smartpricing/traceflow-sdk/actions/workflows/go-ci.yml)
[![Go Reference](https://pkg.go.dev/badge/github.com/smartpricing/traceflow-sdk/go.svg)](https://pkg.go.dev/github.com/smartpricing/traceflow-sdk/go)
[![Go Report Card](https://goreportcard.com/badge/github.com/smartpricing/traceflow-sdk/go)](https://goreportcard.com/report/github.com/smartpricing/traceflow-sdk/go)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)

Stateless, event-based distributed tracing for Go. Zero external dependencies.

```bash
go get github.com/smartpricing/traceflow-sdk/go
```

## Quick start

```go
package main

import (
	"context"

	traceflow "github.com/smartpricing/traceflow-sdk/go"
)

func main() {
	sdk, err := traceflow.New(traceflow.Config{
		Transport: traceflow.TransportHTTP,
		Source:    "my-service",
		Endpoint:  "http://localhost:3009",
		APIKey:    "your-api-key",
	})
	if err != nil {
		panic(err)
	}
	ctx := context.Background()
	defer sdk.Shutdown(ctx)

	trace, _ := sdk.StartTrace(ctx, traceflow.StartTraceOptions{Title: "My Process"})

	step, _ := trace.StartStep(ctx, traceflow.StartStepOptions{Name: "Step 1"})
	_ = step.Finish(ctx, traceflow.FinishStepOptions{Output: "done"})

	_ = trace.Finish(ctx, traceflow.FinishTraceOptions{Result: "success"})
}
```

### Scoped execution

`RunWithTrace` and `TraceHandle.WithStep` start, then automatically finish (on
success) or fail (on error) the trace/step, propagating your `fn`'s error:

```go
err := sdk.RunWithTrace(ctx, traceflow.StartTraceOptions{Title: "Job"},
	func(ctx context.Context, trace *traceflow.TraceHandle) error {
		return trace.WithStep(ctx, traceflow.StartStepOptions{Name: "work"},
			func(ctx context.Context, step *traceflow.StepHandle) error {
				return doWork(ctx)
			})
	})
```

## Context propagation

The trace and step IDs ride on `context.Context` (the Go-idiomatic replacement
for the JS SDK's `AsyncLocalStorage`). The `ctx` passed into your `RunWithTrace`
/ `WithStep` callbacks already carries them:

```go
id, ok := traceflow.TraceIDFromContext(ctx)
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `Source` | — | **Required.** Identifies the emitting service. |
| `Transport` | `http` | Delivery mechanism. |
| `Endpoint` | — | Required for HTTP transport (unless disabled). |
| `APIKey` / `Username`+`Password` | — | Authentication. |
| `Enabled` | `true` | Master kill switch. When `false`, every event is dropped via `NullTransport` — no HTTP, no required endpoint. |
| `Timeout` | `5s` | Per-request HTTP timeout. |
| `MaxRetries` | `3` | Retry attempts on network / 5xx errors. |
| `RetryDelay` | `1s` | Base for exponential backoff with jitter. |
| `EnableCircuitBreaker` | `true` | Buffer + replay events when the backend is unhealthy. |
| `CircuitBreakerThreshold` | `5` | Failures before the circuit opens. |
| `CircuitBreakerTimeout` | `60s` | How long the circuit stays open. |
| `SilentErrors` | `true` | Never return transport errors; log and continue. |
| `EnableLogging` / `LogLevel` / `Logger` | `true` / `info` / built-in | Internal logging. |

## Behavior

- **Safe by default.** With `SilentErrors` (the default), transport failures are
  logged and swallowed so tracing never breaks your application.
- **Idempotent close.** `Finish`/`Fail`/`Cancel` run once; later calls are no-ops.
- **Orphan cleanup.** Finishing a trace fails any still-open steps; `Shutdown`
  fails any still-open traces.
- **Concurrency-safe.** `Client`, `TraceHandle`, and `StepHandle` are safe for
  concurrent use.

## Versioning

This module is released independently from the JS/PHP/Java SDKs in this repo —
their version numbers do not correspond to each other, so don't read anything
into them matching or diverging.

Releases are tagged `go/vX.Y.Z` (not just `vX.Y.Z`): Go requires a tag prefixed
with the subdirectory name for a module that lives in a subdirectory of a
multi-module repo ([reference](https://go.dev/ref/mod#vcs-version)). You never
type the `go/` prefix yourself — it's a detail of how this source repo is
tagged, not part of the version:

```bash
go get github.com/smartpricing/traceflow-sdk/go@latest    # or @v1.2.3
```

The module path (`go.mod`: `module github.com/smartpricing/traceflow-sdk/go`)
has no `/v2` suffix, so per Go's
[Semantic Import Versioning](https://go.dev/ref/mod#major-version-suffixes)
only `v0.x.x` and `v1.x.x` can ever be resolved through it — a `v2.0.0` tag
here would simply fail to resolve for consumers. Breaking changes are expected
to stay within `v1` (bumping the minor with a documented migration note) for as
long as practical; if a genuine `v2` is ever needed, the module path itself
must be renamed to end in `/v2`, which is a breaking change to every
consumer's import statement, not just a version bump.

Releases are cut via the `Release Go SDK` GitHub Actions workflow
(`workflow_dispatch`, pick a version, it tags + creates a GitHub Release).
There is no separate build or publish step — tagging *is* the release.
