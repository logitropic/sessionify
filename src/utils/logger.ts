export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  correlationId: string;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

function emit(level: LogLevel, correlationId: string, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    correlationId,
    message,
    ...(meta ?? {}),
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

export function createLogger(correlationId = crypto.randomUUID()): Logger {
  return {
    correlationId,
    debug: (message, meta) => emit('debug', correlationId, message, meta),
    info: (message, meta) => emit('info', correlationId, message, meta),
    warn: (message, meta) => emit('warn', correlationId, message, meta),
    error: (message, meta) => emit('error', correlationId, message, meta),
  };
}
