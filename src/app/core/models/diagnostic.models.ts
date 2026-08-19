export type DiagnosticStatus = 'draft' | 'analyzed' | 'escalated' | 'closed';
export type DiagnosticSeverity = 'low' | 'medium' | 'high';

export interface DiagnosticPayload {
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
}

export interface DiagnosticCaseRecord extends DiagnosticPayload {
  id: number;
  userId: number;
  status: DiagnosticStatus;
  analysisSummary: string | null;
  severity: DiagnosticSeverity | null;
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
  userFullName?: string;
  username?: string;
}
