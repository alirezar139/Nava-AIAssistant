import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const logsDir = join(dirname(fileURLToPath(import.meta.url)), '../../logs');

type LogLevel = 'info' | 'warn' | 'error';

export interface LiveLogEntry {
  seq: number;
  timestamp: string;
  level: LogLevel;
  text: string;
}

// Recent lines are kept in memory so the live log can be polled cheaply
// without re-reading the daily log file on every tick.
const LIVE_BUFFER_SIZE = 1000;
const liveBuffer: LiveLogEntry[] = [];
let liveSeq = 0;

// Changes on every restart so clients can tell a reset sequence apart from "no new lines".
export const liveLogBootId = randomUUID().slice(0, 8);

export function readLiveLogs(after: number, limit: number): { entries: LiveLogEntry[]; lastSeq: number } {
  const entries = liveBuffer.filter((entry) => entry.seq > after);
  return { entries: entries.slice(-limit), lastSeq: liveSeq };
}

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
  const timestamp = new Date().toISOString();
  const text = `${message}${meta !== undefined ? ` ${serializeMeta(meta)}` : ''}`;
  const line = `${timestamp} [${level.toUpperCase()}] ${text}`;
  liveBuffer.push({ seq: ++liveSeq, timestamp, level, text });
  if (liveBuffer.length > LIVE_BUFFER_SIZE) liveBuffer.shift();
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
