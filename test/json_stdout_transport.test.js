'use strict';

const assert = require('node:assert');
const os = require('node:os');
const { levels } = require('egg-logger');
const JsonStdoutTransport = require('../lib/json_stdout_transport');

function captureOutput(fn) {
  const stdout = [];
  const stderr = [];
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  process.stdout.write = chunk => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = chunk => {
    stderr.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  }
  return { stdout, stderr };
}

// Minimal Koa-flavored ctx stub used across the transport tests.
function makeCtx({ headers = {}, method = 'GET', url = '/', ip = '127.0.0.1', user, starttime } = {}) {
  return {
    method,
    url,
    ip,
    state: user ? { user } : {},
    starttime,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
}

describe('JsonStdoutTransport', () => {
  it('writes a single-line JSON to stdout at INFO', () => {
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout, stderr } = captureOutput(() => {
      transport.log('INFO', [ 'hello' ]);
    });
    assert.strictEqual(stderr.length, 0);
    assert.strictEqual(stdout.length, 1);
    assert(stdout[0].endsWith('\n'));
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.level, 'INFO');
    assert.strictEqual(parsed.msg, 'hello');
    assert.strictEqual(parsed.pid, process.pid);
    assert.strictEqual(parsed.hostname, os.hostname());
    assert(!Number.isNaN(Date.parse(parsed.time)));
  });

  it('routes ERROR to stderr and leaves stdout empty', () => {
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout, stderr } = captureOutput(() => {
      transport.log('ERROR', [ 'oops' ]);
    });
    assert.strictEqual(stdout.length, 0);
    assert.strictEqual(stderr.length, 1);
    const parsed = JSON.parse(stderr[0]);
    assert.strictEqual(parsed.level, 'ERROR');
    assert.strictEqual(parsed.msg, 'oops');
  });

  it('enriches ctx logs with requestId / method / url / ip / userId / useMs', () => {
    const ctx = makeCtx({
      headers: { 'x-fc-request-id': '1-abcdef' },
      method: 'POST',
      url: '/api/foo',
      ip: '10.0.0.1',
      user: { id: 42 },
      starttime: Date.now() - 5,
    });
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'req done' ], { ctx });
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.requestId, '1-abcdef');
    assert.strictEqual(parsed.method, 'POST');
    assert.strictEqual(parsed.url, '/api/foo');
    assert.strictEqual(parsed.ip, '10.0.0.1');
    assert.strictEqual(parsed.userId, 42);
    assert(typeof parsed.useMs === 'number' && parsed.useMs >= 5);
  });

  it('omits requestId / userId when the ctx has no such data', () => {
    const ctx = makeCtx();
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout } = captureOutput(() => {
      transport.log('WARN', [ 'nothing' ], { ctx });
    });
    const parsed = JSON.parse(stdout[0]);
    assert(!('requestId' in parsed));
    assert(!('userId' in parsed));
    assert.strictEqual(parsed.level, 'WARN');
  });

  it('honors a custom requestIdHeader', () => {
    const ctx = makeCtx({ headers: { 'x-custom-id': 'rid-custom' } });
    const transport = new JsonStdoutTransport({
      level: levels.INFO,
      requestIdHeader: 'x-custom-id',
    });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'custom' ], { ctx });
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.requestId, 'rid-custom');
  });

  it('applies extraFields(ctx) and merges returned keys', () => {
    const ctx = makeCtx({ headers: { 'x-tenant-id': 'acme' } });
    const transport = new JsonStdoutTransport({
      level: levels.INFO,
      extraFields: c => ({ tenantId: c.get('x-tenant-id') }),
    });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'with extras' ], { ctx });
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.tenantId, 'acme');
  });

  it('swallows errors thrown from extraFields', () => {
    const ctx = makeCtx();
    const transport = new JsonStdoutTransport({
      level: levels.INFO,
      extraFields: () => {
        throw new Error('boom from extraFields');
      },
    });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'survives' ], { ctx });
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.msg, 'survives');
  });

  it('falls back to AsyncLocalStorage when meta.ctx is absent', () => {
    const ctx = makeCtx({ headers: { 'x-fc-request-id': 'als-id' } });
    const fakeStorage = { getStore: () => ctx };
    const transport = new JsonStdoutTransport({ level: levels.INFO, localStorage: fakeStorage });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'via als' ]);
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.requestId, 'als-id');
  });

  it('serializes Error with stack trace', () => {
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const err = new Error('boom');
    const { stderr } = captureOutput(() => {
      transport.log('ERROR', [ err ]);
    });
    const parsed = JSON.parse(stderr[0]);
    assert(parsed.msg.startsWith('Error: boom'));
    assert(parsed.msg.includes(__filename.split('/').pop()));
  });

  it('supports printf-style formatting', () => {
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout } = captureOutput(() => {
      transport.log('INFO', [ 'hi %s, code=%d', 'world', 7 ]);
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.msg, 'hi world, code=7');
  });

  it('passes raw writes through', () => {
    const transport = new JsonStdoutTransport({ level: levels.INFO });
    const { stdout } = captureOutput(() => {
      transport.log('NONE', [ 'raw line' ], { raw: true });
    });
    const parsed = JSON.parse(stdout[0]);
    assert.strictEqual(parsed.msg, 'raw line');
    assert.strictEqual(parsed.level, 'NONE');
  });
});
