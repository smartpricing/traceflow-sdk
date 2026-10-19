# Traceflow SDKs

Clients for [Traceflow](https://github.com/smartpricing/traceflow-service).

| SDK | Package | Documentation |
| --- | --- | --- |
| JavaScript / TypeScript | `@dev.smartpricing/traceflow-sdk` | [Setup](js/README.md), [Audit Log](js/README.md#audit-log), [Error Monitoring](js/README.md#error-monitoring) |
| PHP / Laravel | `smartness/traceflow-laravel` | [php/laravel/README.md](php/laravel/README.md) |
| Go | `github.com/smartpricing/traceflow-sdk/go` | [go/README.md](go/README.md) |
| Java | See module configuration | [java/core/README.md](java/core/README.md) |

Native audit logging is implemented in the Node and Laravel SDKs. Laravel includes
model capture and delivery through a Queen MQ queue. See each package's README for
setup, supported transports and tests.

The Laravel package is published from the
[split repository](https://github.com/smartpricing/traceflow-laravel).
Package versions and release workflows are separate; merging code here does not
publish every SDK.

Traceflow Error Monitoring captures JavaScript errors from browser, Nuxt and
React Native apps. See the [setup and integration guide](js/ERROR_MONITORING.md).
