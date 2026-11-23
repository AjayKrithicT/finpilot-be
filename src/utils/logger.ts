type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  method?: string;
  path?: string;
  status_code?: number;
  duration_ms?: number;
  user_id?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, meta?: Partial<LogEntry>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info: (message: string, meta?: Partial<LogEntry>) => write('info', message, meta),
  warn: (message: string, meta?: Partial<LogEntry>) => write('warn', message, meta),
  error: (message: string, meta?: Partial<LogEntry>) => write('error', message, meta),
  debug: (message: string, meta?: Partial<LogEntry>) => write('debug', message, meta),
};
