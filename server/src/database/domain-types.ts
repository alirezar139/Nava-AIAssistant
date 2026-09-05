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
  rating?: number | null;
  ratingSubmittedAt?: string | null;
  createdAt: string;
}

export type DiagnosticStatus = 'draft' | 'analyzed' | 'escalated' | 'closed';

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
  externalTicketStatusCode?: number | null;
  externalTicketError?: string | null;
  similarIssueCount?: number;
  similarUserCount?: number;
  duplicateOfDiagnosticId?: number | null;
  duplicateNotice?: string;
  rating?: number | null;
  ratingComment?: string;
  ratingSubmittedAt?: string | null;
  createdAt: string;
  analyzedAt: string | null;
  closedAt?: string | null;
}

export interface TicketRequestTypeMappingRecord {
  nodeId: string;
  nodeLabel: string;
  serviceDeskId: string;
  requestTypeId: string;
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

export type TroubleshootingTreeMode = 'active' | 'draft';

export type DashboardMetricKey =
  | 'activeFaqs'
  | 'userRequests'
  | 'engagedUsers'
  | 'faqCoverageRate'
  | 'diagnosticCases'
  | 'treeNodes'
  | 'treeEdges'
  | 'activeServices'
  | 'sahandSubmitted';

export interface DashboardMetricLogRecord {
  key: DashboardMetricKey;
  label: string;
  value: number;
  order: number;
  source: string;
  updatedAt: string;
}
