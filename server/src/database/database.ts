import bcrypt from 'bcryptjs';
import { JSONFilePreset } from 'lowdb/node';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '../common/types.js';

export interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface FaqRecord {
  id: number;
  question: string;
  answer: string;
  category: string;
  keywords: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: number;
  userId: number;
  question: string;
  answer: string;
  matchedFaqId: number | null;
  createdAt: string;
}

interface DatabaseSchema {
  users: UserRecord[];
  faqs: FaqRecord[];
  conversations: ConversationRecord[];
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = resolve(currentDirectory, '../../data');
await mkdir(dataDirectory, { recursive: true });

export const database = await JSONFilePreset<DatabaseSchema>(resolve(dataDirectory, 'database.json'), {
  users: [],
  faqs: [],
  conversations: []
});

const now = new Date().toISOString();
if (!database.data.users.some((user) => user.username === 'admin')) {
  database.data.users.push({
    id: 1,
    username: 'admin',
    passwordHash: bcrypt.hashSync('Admin@123', 12),
    fullName: 'مدیر سامانه',
    role: 'admin',
    createdAt: now
  });
}
if (!database.data.users.some((user) => user.username === 'user')) {
  database.data.users.push({
    id: 2,
    username: 'user',
    passwordHash: bcrypt.hashSync('User@123', 12),
    fullName: 'کاربر آزمایشی',
    role: 'user',
    createdAt: now
  });
}
await database.write();

export function nextId(records: Array<{ id: number }>): number {
  return records.reduce((maximum, record) => Math.max(maximum, record.id), 0) + 1;
}
