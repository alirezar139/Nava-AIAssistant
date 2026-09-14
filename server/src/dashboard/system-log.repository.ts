import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const logsDir = join(dirname(fileURLToPath(import.meta.url)), '../../logs');

export type SystemLogLevel = 'info' | 'warn' | 'error';

export interface SystemLogEntry {
  timestamp: string;
  level: SystemLogLevel;
  text: string;
}

export interface SystemLogQuery {
  level?: SystemLogLevel;
  search?: string;
  limit: number;
}

const LINE_PATTERN = /^(\S+) \[(INFO|WARN|ERROR)\] (.*)$/;
const LOG_FILE_PATTERN = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

export async function listSystemLogDates(): Promise<string[]> {
  try {
    const files = await readdir(logsDir);
    return files
      .map((file) => LOG_FILE_PATTERN.exec(file)?.[1])
      .filter((date): date is string => Boolean(date))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readSystemLog(date: string, query: SystemLogQuery): Promise<SystemLogEntry[]> {
  let content: string;
  try {
    content = await readFile(join(logsDir, `app-${date}.log`), 'utf8');
  } catch {
    return [];
  }

  const search = query.search?.trim().toLocaleLowerCase();
  const entries: SystemLogEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const match = LINE_PATTERN.exec(line);
    if (!match || !match[1] || !match[2] || match[3] === undefined) continue;
    const timestamp = match[1];
    const level = match[2].toLocaleLowerCase() as SystemLogLevel;
    const text = match[3];
    if (query.level && level !== query.level) continue;
    if (search && !text.toLocaleLowerCase().includes(search)) continue;
    entries.push({ timestamp, level, text });
  }

  return entries.slice(-query.limit).reverse();
}
