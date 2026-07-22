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
  raiseOnBehalfOf: string;
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

export interface ProjectRecord {
  key: string;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  shape?: string;
  x?: number | null;
  y?: number | null;
}

export interface TroubleshootingTreeEdgeRecord {
  from: string;
  to: string;
  label?: string;
}

export interface TroubleshootingTreeRecord {
  projectKey?: string;
  startNodeId: string;
  introNodeIds: string[];
  nodes: TroubleshootingTreeNodeRecord[];
  edges: TroubleshootingTreeEdgeRecord[];
}

export type TroubleshootingTreeMode = 'active' | 'draft';

export interface TroubleshootingTreeVersionRecord extends TroubleshootingTreeRecord {
  projectKey: string;
  mode: TroubleshootingTreeMode;
  version: number;
  status: TroubleshootingTreeMode;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface AppSettingsRecord {
  ticketService: TicketServiceSettingsRecord;
}

interface DatabaseSchema {
  users: UserRecord[];
  projects: Record<string, ProjectRecord>;
  faqs: FaqRecord[];
  conversations: ConversationRecord[];
  diagnosticCases: DiagnosticCaseRecord[];
  externalServices: ExternalServiceRecord[];
  troubleshootingTree: TroubleshootingTreeRecord | null;
  troubleshootingTrees: Record<string, TroubleshootingTreeRecord>;
  troubleshootingTreeVersions: Record<string, TroubleshootingTreeVersionRecord>;
  settings: AppSettingsRecord;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = config.dataDirectory
  ? resolve(config.dataDirectory)
  : resolve(currentDirectory, '../../data');
await mkdir(dataDirectory, { recursive: true });

export const database = await JSONFilePreset<DatabaseSchema>(resolve(dataDirectory, config.dataFileName), {
  users: [],
  projects: {},
  faqs: [],
  conversations: [],
  diagnosticCases: [],
  externalServices: [],
  troubleshootingTree: null,
  troubleshootingTrees: {},
  troubleshootingTreeVersions: {},
  settings: {
    ticketService: {
      url: '',
      authorizationHeader: '',
      authHeader: '',
      raiseOnBehalfOf: '',
      serviceDeskId: '',
      requestTypeId: '',
      requestTypeMappings: [],
      updatedAt: null
    }
  }
});

const now = new Date().toISOString();
database.data.projects ??= {};
database.data.diagnosticCases ??= [];
database.data.externalServices ??= [];
database.data.troubleshootingTree ??= null;
database.data.troubleshootingTrees ??= {};
database.data.troubleshootingTreeVersions ??= {};
if (database.data.troubleshootingTree && !database.data.troubleshootingTrees['default']) {
  database.data.troubleshootingTrees['default'] = database.data.troubleshootingTree;
}
ensureLocalProject('default', 'پروژه پیش‌فرض', now);
migrateLegacyTroubleshootingTrees(now);
database.data.settings ??= {
  ticketService: {
    url: '',
    authorizationHeader: '',
    authHeader: '',
    raiseOnBehalfOf: '',
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
  raiseOnBehalfOf: '',
  serviceDeskId: '',
  requestTypeId: '',
  requestTypeMappings: [],
  updatedAt: null
};
database.data.settings.ticketService.url ??= '';
database.data.settings.ticketService.authorizationHeader ??= '';
database.data.settings.ticketService.authHeader ??= '';
database.data.settings.ticketService.raiseOnBehalfOf ??= '';
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

export function troubleshootingTreeVersionKey(projectKey: string, mode: TroubleshootingTreeMode): string {
  return `${projectKey}:${mode}`;
}

function ensureLocalProject(projectKey: string, title: string, timestamp: string): void {
  database.data.projects[projectKey] ??= {
    key: projectKey,
    title,
    description: '',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function migrateLegacyTroubleshootingTrees(timestamp: string): void {
  const trees = {
    ...database.data.troubleshootingTrees,
    ...(database.data.troubleshootingTree ? { default: database.data.troubleshootingTree } : {})
  };

  Object.entries(trees).forEach(([storageKey, tree]) => {
    if (!tree?.nodes?.length) return;
    const { projectKey, mode } = parseLegacyTreeStorageKey(storageKey);
    ensureLocalProject(projectKey, projectKey === 'default' ? 'پروژه پیش‌فرض' : projectKey, timestamp);
    const versionKey = troubleshootingTreeVersionKey(projectKey, mode);
    database.data.troubleshootingTreeVersions[versionKey] ??= {
      ...tree,
      projectKey,
      mode,
      status: mode,
      version: 1,
      nodeCount: tree.nodes.length,
      edgeCount: tree.edges.length,
      createdAt: timestamp,
      updatedAt: timestamp,
      activatedAt: mode === 'active' ? timestamp : null
    };
  });
}

function parseLegacyTreeStorageKey(storageKey: string): {
  projectKey: string;
  mode: TroubleshootingTreeMode;
} {
  if (storageKey.endsWith('__draft')) {
    return {
      projectKey: storageKey.slice(0, -'__draft'.length) || 'default',
      mode: 'draft'
    };
  }
  return { projectKey: storageKey || 'default', mode: 'active' };
}
