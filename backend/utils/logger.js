const env = require('../config/env');

const shouldLog = (level) => !(env.isProduction && level === 'debug');

const write = (level, message, meta) => {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.log(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line, meta);
};

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
