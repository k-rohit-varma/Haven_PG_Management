const levels = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level, fields = {}) {
  const threshold = levels[process.env.LOG_LEVEL] ?? levels.info;
  if (levels[level] < threshold) return;
  const record = { timestamp: new Date().toISOString(), level, ...fields };
  const output = process.env.NODE_ENV === 'production' ? JSON.stringify(record) : `${record.timestamp} ${level.toUpperCase()} ${record.event || record.operation || ''} ${JSON.stringify(fields)}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(output);
}

export const logger = Object.fromEntries(Object.keys(levels).map((level) => [level, (fields) => write(level, fields)]));
