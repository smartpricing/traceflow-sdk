# Traceflow SDKs

Clients for [Traceflow](https://github.com/smartpricing/traceflow-service).

| SDK | Package | Documentation |
| --- | --- | --- |
| JavaScript / TypeScript | `@dev.smartpricing/traceflow-sdk` | [js/README.md](js/README.md) |
| PHP / Laravel | `smartness/traceflow-laravel` | [php/laravel/README.md](php/laravel/README.md) |
| Go | `github.com/smartpricing/traceflow-sdk/go` | [go/README.md](go/README.md) |
| Java | See module configuration | [java/core/README.md](java/core/README.md) |

Native audit logging is implemented in the Node and Laravel SDKs. Laravel includes
model capture and a transactional outbox. See each package's README for setup,
supported transports and tests.

The Laravel package is published from the
[split repository](https://github.com/smartpricing/traceflow-laravel).
Package versions and release workflows are separate; merging code here does not
publish every SDK.

Frontend error reporting is available through the JS package's browser, Nuxt and
React Native entry points. See [client error setup](js/ERRORS.md).
