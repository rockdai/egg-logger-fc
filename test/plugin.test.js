'use strict';

const assert = require('node:assert');
const path = require('node:path');
const mm = require('egg-mock');
const { levels } = require('egg-logger');
const JsonStdoutTransport = require('../lib/json_stdout_transport');

describe('egg-logger-fc plugin', () => {
  let app;

  before(async () => {
    app = mm.app({
      baseDir: path.join(__dirname, 'fixtures/apps/logger-fc-app'),
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  afterEach(mm.restore);

  it('replaces the console transport on every logger with JsonStdoutTransport', () => {
    let count = 0;
    for (const logger of app.loggers.values()) {
      count++;
      const consoleTransport = logger.get('console');
      assert(consoleTransport instanceof JsonStdoutTransport,
        `console transport for ${logger.constructor.name} should be JsonStdoutTransport`);
    }
    assert(count > 0, 'should have at least one logger');
  });

  it('disables file / jsonFile transports', () => {
    for (const logger of app.loggers.values()) {
      const file = logger.get('file');
      if (file) assert.strictEqual(file.enabled, false);
      const jsonFile = logger.get('jsonFile');
      if (jsonFile) assert.strictEqual(jsonFile.enabled, false);
    }
  });

  it('propagates config.loggerFC.extraFields to the transport', () => {
    for (const logger of app.loggers.values()) {
      const consoleTransport = logger.get('console');
      assert.strictEqual(typeof consoleTransport.options.extraFields, 'function');
    }
  });

  it('wires app.ctxStorage into the transport so ctx is resolved via AsyncLocalStorage', () => {
    for (const logger of app.loggers.values()) {
      const consoleTransport = logger.get('console');
      assert.strictEqual(consoleTransport.options.localStorage, app.ctxStorage);
    }
  });

  it('tags each transport with the logger name from app.loggers', () => {
    for (const [ name, logger ] of app.loggers) {
      const consoleTransport = logger.get('console');
      assert.strictEqual(consoleTransport.options.name, name);
    }
  });

  it('respects ALIYUN_FC_LOG_LEVEL when calling configureFCLogging manually', () => {
    const configureFCLogging = require('../lib/configure');
    mm(process.env, 'ALIYUN_FC_LOG_LEVEL', 'warn');
    configureFCLogging(app);
    for (const logger of app.loggers.values()) {
      assert.strictEqual(logger.get('console').options.level, levels.WARN);
    }
  });
});
