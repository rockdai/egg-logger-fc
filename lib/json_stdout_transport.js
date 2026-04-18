'use strict';

const os = require('node:os');
const util = require('node:util');
const { Transport } = require('egg-logger');

const HOSTNAME = os.hostname();
const EOL = '\n';
const DEFAULT_REQUEST_ID_HEADER = 'x-fc-request-id';

function formatMessage(args) {
  if (!args || args.length === 0) return '';
  if (args[0] instanceof Error) return args[0].stack || String(args[0]);
  return util.format(...args);
}

function extractCtxFields(ctx, requestIdHeader) {
  const fields = {};
  const requestId = typeof ctx.get === 'function' ? ctx.get(requestIdHeader) : undefined;
  if (requestId) fields.requestId = requestId;
  if (ctx.method) fields.method = ctx.method;
  if (ctx.url) fields.url = ctx.url;
  if (ctx.ip) fields.ip = ctx.ip;
  const userId = ctx.state && ctx.state.user && ctx.state.user.id;
  if (userId != null) fields.userId = userId;
  if (typeof ctx.starttime === 'number') fields.useMs = Date.now() - ctx.starttime;
  return fields;
}

// Writes one JSON line per log call to stdout/stderr. FC 3.0 forwards
// both streams to the bound SLS Logstore automatically, so each field
// becomes individually queryable in SLS.
class JsonStdoutTransport extends Transport {
  log(level, args, meta) {
    let ctx = meta && meta.ctx;
    if (!ctx && this.options.localStorage) {
      ctx = this.options.localStorage.getStore();
    }

    const message = meta && meta.raw === true
      ? (args && args[0] != null ? String(args[0]) : '')
      : formatMessage(args);
    if (!message) return;

    const entry = {
      time: new Date().toISOString(),
      level,
      pid: process.pid,
      hostname: HOSTNAME,
      msg: message,
    };
    if (this.options.name) entry.logger = this.options.name;

    if (ctx) {
      Object.assign(entry, extractCtxFields(ctx, this.options.requestIdHeader || DEFAULT_REQUEST_ID_HEADER));
      const extra = this.options.extraFields;
      if (typeof extra === 'function') {
        try {
          const custom = extra(ctx);
          if (custom && typeof custom === 'object') Object.assign(entry, custom);
        } catch (_err) {
          // Never let logging configuration break the request flow.
        }
      }
    }

    const line = JSON.stringify(entry) + EOL;
    const stream = level === 'ERROR' ? process.stderr : process.stdout;
    stream.write(line);
  }
}

module.exports = JsonStdoutTransport;
module.exports.DEFAULT_REQUEST_ID_HEADER = DEFAULT_REQUEST_ID_HEADER;
