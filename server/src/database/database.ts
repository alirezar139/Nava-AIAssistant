import bcrypt from 'bcryptjs';
import { JSONFilePreset } from 'lowdb/node';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '../common/types.js';
import { config } from '../config/config.js';

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
  rating?: number | null;
  ratingSubmittedAt?: string | null;
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
  rating?: number | null;
  ratingComment?: string;
  ratingSubmittedAt?: string | null;
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

export type ExternalServiceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ExternalServiceRecord {
  id: number;
  key: string;
  title: string;
  purpose: string;
  sectionTitle: string;
  method: ExternalServiceMethod;
  url: string;
  authorizationHeader: string;
  authHeader: string;
  headersText: string;
  bodyTemplate: string;
  isActive: boolean;
  showInAssistant: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TroubleshootingTreeNodeRecord {
  id: string;
  text: string;
  shape?:
    | 'process'
    | 'decision'
    | 'terminator'
    | 'data'
    | 'document'
    | 'erd-entity'
    | 'erd-weak-entity'
    | 'erd-relationship'
    | 'erd-identifying-relationship'
    | 'erd-attribute'
    | 'erd-multivalued-attribute'
    | 'erd-table'
    | 'erd-lookup-table'
    | 'erd-associative-entity'
    | 'erd-subtype';
  x?: number | null;
  y?: number | null;
}

export interface TroubleshootingTreeEdgeRecord {
  from: string;
  to: string;
  label?: string;
}

export interface TroubleshootingTreeRecord {
  startNodeId: string;
  introNodeIds: string[];
  nodes: TroubleshootingTreeNodeRecord[];
  edges: TroubleshootingTreeEdgeRecord[];
}

export interface AppSettingsRecord {
  ticketService: TicketServiceSettingsRecord;
}

interface DatabaseSchema {
  users: UserRecord[];
  faqs: FaqRecord[];
  conversations: ConversationRecord[];
  diagnosticCases: DiagnosticCaseRecord[];
  externalServices: ExternalServiceRecord[];
  troubleshootingTree: TroubleshootingTreeRecord | null;
  troubleshootingTrees: Record<string, TroubleshootingTreeRecord>;
  settings: AppSettingsRecord;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = config.dataDirectory
  ? resolve(config.dataDirectory)
  : resolve(currentDirectory, '../../data');
await mkdir(dataDirectory, { recursive: true });

export const database = await JSONFilePreset<DatabaseSchema>(resolve(dataDirectory, config.dataFileName), {
  users: [],
  faqs: [],
  conversations: [],
  diagnosticCases: [],
  externalServices: [],
  troubleshootingTree: null,
  troubleshootingTrees: {},
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
database.data.externalServices ??= [];
database.data.troubleshootingTree ??= null;
database.data.troubleshootingTrees ??= {};
if (database.data.troubleshootingTree && !database.data.troubleshootingTrees['default']) {
  database.data.troubleshootingTrees['default'] = database.data.troubleshootingTree;
}
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
database.data.conversations.forEach((item) => {
  item.rating ??= null;
  item.ratingSubmittedAt ??= null;
});
database.data.diagnosticCases.forEach((item) => {
  item.rating ??= null;
  item.ratingComment ??= '';
  item.ratingSubmittedAt ??= null;
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
