# egg-logger-fc

Ship Egg.js logs to Alibaba Cloud SLS via Function Compute stdout — JSON lines with the FC RequestId attached.

## Why

FC 3.0 automatically collects everything an instance writes to `stdout` / `stderr` into the bound SLS Logstore ([official doc](https://help.aliyun.com/zh/functioncompute/fc-3-0/user-guide/logging)). egg-logger's default behavior writes to local files under `/tmp/log`, which vanish when the FC instance is destroyed — SLS never sees them.

This plugin:

1. Disables egg-logger's `file` / `jsonFile` transports on every logger.
2. Replaces the `console` transport with a JSON one that writes to stdout (info / warn / debug) and stderr (error).
3. Attaches the FC `x-fc-request-id` header plus standard ctx fields (`method`, `url`, `ip`, `userId`, `useMs`) to every request-scoped log line, so each field becomes individually queryable in SLS.
4. Tags every line with the source logger's name (`logger: "coreLogger" | "errorLogger" | "logger" | "<customLoggerName>"`), so SLS queries can still split what used to live in `egg-web.log` / `common-error.log` / `<app>-web.log` / custom log files.

## Install

```bash
npm i egg-logger-fc
```

## Enable

```js
// config/plugin.js
exports.loggerFC = {
  enable: true,
  package: 'egg-logger-fc',
};
```

With zero config, business logs land in SLS as:

```json
{"time":"2026-04-17T07:00:26.518Z","level":"INFO","pid":12,"hostname":"fc-xxx","msg":"[auth] login ok","logger":"logger","requestId":"1-abcdef","method":"POST","url":"/api/auth/session","ip":"10.0.0.1","userId":42,"useMs":34}
```

To slice what used to be separate log files, filter on `logger`:

- `logger: logger` — business logs (was `<app>-web.log`)
- `logger: coreLogger` — Egg framework core logs (was `egg-web.log`)
- `logger: errorLogger` — centralized errors (was `common-error.log`)
- `logger: <name>` — any `config.customLogger[name]` you declared

## Configure

```js
// config/config.default.js
exports.loggerFC = {
  // Default: 'x-fc-request-id' (FC 3.0 convention)
  requestIdHeader: 'x-fc-request-id',

  // Optional: merge extra fields into every request-scoped log line.
  // Must return a plain object. Thrown errors are swallowed so that a
  // broken config never breaks request handling.
  extraFields: ctx => ({
    traceId: ctx.get('x-trace-id'),
    tenantId: ctx.state.tenantId,
  }),
};
```

## Log level

Set `ALIYUN_FC_LOG_LEVEL` (FC's standard env var) to `debug` / `info` / `warn` / `error`. The plugin maps it to the console transport's level on every logger.

## Advanced: using the transport directly

If you want the transport without the auto-configuration (e.g. to attach it to a custom logger), import it:

```js
const { JsonStdoutTransport } = require('egg-logger-fc');

app.getLogger('auditLogger').set('console', new JsonStdoutTransport({
  name: 'auditLogger', // becomes the `logger` field in every emitted JSON line
  level: 'INFO',
  localStorage: app.ctxStorage,
  requestIdHeader: 'x-fc-request-id',
  extraFields: ctx => ({ userId: ctx.state.user?.id }),
}));
```

## License

[MIT](LICENSE)
