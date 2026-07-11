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

export type DiagnosticStatus = 'draft' | 'analyzed' | 'escalated';

export interface DiagnosticCaseRecord {
  id: number;
  userId: number;
  title: string;
  problem: string;
  systemName: string;
  processName: string;
  scenario: string;
  serialNumber: string;
  errorText: string;
  evidence: string;
  treeNodeId: string;
  treeNodeText: string;
  status: DiagnosticStatus;
  analysisSummary: string | null;
  severity: 'low' | 'medium' | 'high' | null;
  recommendation: string | null;
  externalTicketId?: string | null;
  externalTrackingId?: string | null;
  externalTicketStatus?: 'not_configured' | 'submitted' | 'failed' | null;
  createdAt: string;
  analyzedAt: string | null;
}

export interface TicketServiceSettingsRecord {
  url: string;
  authorizationHeader: string;
  authHeader: string;
  serviceDeskId: string;
  requestTypeId: string;
  requestTypeMappings: TicketRequestTypeMappingRecord[];
  updatedAt: string | null;
}

export interface TicketRequestTypeMappingRecord {
  nodeId: string;
  nodeLabel: string;
  serviceDeskId: string;
  requestTypeId: string;
}

export interface AppSettingsRecord {
  ticketService: TicketServiceSettingsRecord;
}

interface DatabaseSchema {
  users: UserRecord[];
  faqs: FaqRecord[];
  conversations: ConversationRecord[];
  diagnosticCases: DiagnosticCaseRecord[];
  settings: AppSettingsRecord;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = resolve(currentDirectory, '../../data');
await mkdir(dataDirectory, { recursive: true });

export const database = await JSONFilePreset<DatabaseSchema>(resolve(dataDirectory, 'database.json'), {
  users: [],
  faqs: [],
  conversations: [],
  diagnosticCases: [],
  settings: {
    ticketService: {
      url: '',
      authorizationHeader: '',
      authHeader: '',
      serviceDeskId: '',
      requestTypeId: '',
      requestTypeMappings: [],
      updatedAt: null
    }
  }
});

database.data.diagnosticCases ??= [];
database.data.settings ??= {
  ticketService: {
    url: '',
    authorizationHeader: '',
    authHeader: '',
    serviceDeskId: '',
    requestTypeId: '',
    requestTypeMappings: [],
    updatedAt: null
  }
};
database.data.settings.ticketService ??= {
  url: '',
  authorizationHeader: '',
  authHeader: '',
  serviceDeskId: '',
  requestTypeId: '',
  requestTypeMappings: [],
  updatedAt: null
};
database.data.settings.ticketService.url ??= '';
database.data.settings.ticketService.authorizationHeader ??= '';
database.data.settings.ticketService.authHeader ??= '';
database.data.settings.ticketService.serviceDeskId ??= '';
database.data.settings.ticketService.requestTypeId ??= '';
database.data.settings.ticketService.requestTypeMappings ??= [];
database.data.settings.ticketService.updatedAt ??= null;

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
