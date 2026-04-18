'use strict';

const { levels } = require('egg-logger');
const JsonStdoutTransport = require('./json_stdout_transport');

const ENV_LEVEL_MAP = {
  debug: levels.DEBUG,
  info: levels.INFO,
  warn: levels.WARN,
  error: levels.ERROR,
};

function resolveEnvLevel() {
  const raw = process.env.ALIYUN_FC_LOG_LEVEL;
  if (!raw) return undefined;
  return ENV_LEVEL_MAP[String(raw).toLowerCase()];
}

// FC 3.0 automatically collects stdout/stderr into the bound SLS Logstore.
// This helper:
//   1. disables egg-logger's file / jsonFile transports (the local files
//      vanish when the FC instance is destroyed — SLS never sees them);
//   2. replaces the console transport with JsonStdoutTransport, so every
//      log line reaches SLS as structured JSON.
function configureFCLogging(app) {
  const config = (app.config && app.config.loggerFC) || {};
  const envLevel = resolveEnvLevel();

  for (const [ name, logger ] of app.loggers) {
    logger.disable('file');
    logger.disable('jsonFile');

    const existing = logger.get('console');
    if (!existing) continue;

    const level = envLevel != null ? envLevel : existing.options.level;
    const replacement = new JsonStdoutTransport({
      name,
      level,
      localStorage: existing.options.localStorage,
      requestIdHeader: config.requestIdHeader,
      extraFields: config.extraFields,
    });
    logger.set('console', replacement);
  }
}

module.exports = configureFCLogging;
