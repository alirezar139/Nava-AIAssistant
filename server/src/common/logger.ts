import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const logsDir = join(dirname(fileURLToPath(import.meta.url)), '../../logs');

type LogLevel = 'info' | 'warn' | 'error';

function currentLogFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(logsDir, `app-${date}.log`);
}

function serializeMeta(meta: unknown): string {
  if (meta instanceof Error) {
    return JSON.stringify({ message: meta.message, stack: meta.stack });
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

async function writeLine(level: LogLevel, message: string, meta?: unknown): Promise<void> {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
    meta !== undefined ? ` ${serializeMeta(meta)}` : ''
  }`;
  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleMethod(line);
  try {
    await mkdir(logsDir, { recursive: true });
    await appendFile(currentLogFile(), `${line}\n`, 'utf8');
  } catch {
    // File logging is best-effort; it must never break the request path.
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => void writeLine('info', message, meta),
  warn: (message: string, meta?: unknown) => void writeLine('warn', message, meta),
  error: (message: string, meta?: unknown) => void writeLine('error', message, meta)
};
