export type DiagnosticStatus = 'draft' | 'analyzed' | 'escalated';
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
}

export interface DiagnosticCaseRecord extends DiagnosticPayload {
  id: number;
  userId: number;
  status: DiagnosticStatus;
  analysisSummary: string | null;
  severity: DiagnosticSeverity | null;
  recommendation: string | null;
  externalTicketId?: string | null;
  externalTicketStatus?: 'not_configured' | 'submitted' | 'failed' | null;
  createdAt: string;
  analyzedAt: string | null;
  userFullName?: string;
  username?: string;
}
