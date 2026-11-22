import type { Logger } from '../env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const REDACTED = '[redacted]';
const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|cookie|api[_-]?key|credential)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1);
  }
  return output;
}

export function createLogger(options: {
  level?: string;
  requestId: string;
  route?: string;
}): Logger {
  const configured = (options.level ?? 'info') as Level;
  const threshold = LEVELS[configured] ?? LEVELS.info;

  const emit = (level: Level, message: string, fields?: Record<string, unknown>) => {
    if (LEVELS[level] < threshold) return;
    const payload = {
      level,
      time: new Date().toISOString(),
      message,
      requestId: options.requestId,
      route: options.route,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
