import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DiagnosticCaseRecord, DiagnosticPayload } from '../models/diagnostic.models';
import { ConversationRecord, FaqRecord } from '../models/faq.models';
import { TroubleshootingTree } from '../models/troubleshooting-tree.models';
import { environment } from '../../../environments/environment';

export type FaqPayload = Pick<FaqRecord, 'question' | 'answer' | 'category' | 'keywords'>;
export interface DiagnosticRatingPayload {
  rating: number;
  ratingComment?: string;
}

export interface ConversationRatingPayload {
  rating: number;
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

export type PublicExternalServiceRecord = Omit<
  ExternalServiceRecord,
  'authorizationHeader' | 'authHeader' | 'headersText' | 'bodyTemplate'
>;

export type ExternalServicePayload = Omit<ExternalServiceRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface ExternalServiceExecutionResult {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  bodyPreview: string;
  executedAt: string;
  errorMessage?: string;
}

export interface TicketServiceSettings {
  url: string;
  authorizationHeader: string;
  authHeader: string;
  serviceDeskId: string;
  requestTypeId: string;
  requestTypeMappings: TicketRequestTypeMapping[];
  updatedAt: string | null;
}

export interface TicketRequestTypeMapping {
  nodeId: string;
  nodeLabel: string;
  serviceDeskId: string;
  requestTypeId: string;
}

export type TicketServiceSettingsPayload = Pick<
  TicketServiceSettings,
  'url' | 'authorizationHeader' | 'authHeader' | 'serviceDeskId' | 'requestTypeId' | 'requestTypeMappings'
>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getFaqs(): Observable<FaqRecord[]> {
    return this.http.get<FaqRecord[]>(`${this.apiUrl}/faqs`);
  }

  createFaq(payload: FaqPayload): Observable<FaqRecord> {
    return this.http.post<FaqRecord>(`${this.apiUrl}/faqs`, payload);
  }

  updateFaq(id: number, payload: FaqPayload): Observable<FaqRecord> {
    return this.http.put<FaqRecord>(`${this.apiUrl}/faqs/${id}`, payload);
  }

  deleteFaq(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/faqs/${id}`);
  }

  deleteFaqs(ids: number[]): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.apiUrl}/faqs/bulk-delete`, { ids });
  }

  importFaqs(payload: FaqPayload[]): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.apiUrl}/faqs/import`, payload);
  }

  getConversations(): Observable<ConversationRecord[]> {
    return this.http.get<ConversationRecord[]>(`${this.apiUrl}/conversations`);
  }

  logConversation(
    question: string,
    answer: string,
    matchedFaqId: number | null
  ): Observable<ConversationRecord> {
    return this.http.post<ConversationRecord>(`${this.apiUrl}/conversations`, {
      question,
      answer,
      matchedFaqId
    });
  }

  rateConversation(id: number, payload: ConversationRatingPayload): Observable<ConversationRecord> {
    return this.http.patch<ConversationRecord>(`${this.apiUrl}/conversations/${id}/rating`, payload);
  }

  createDiagnosticCase(payload: DiagnosticPayload): Observable<DiagnosticCaseRecord> {
    return this.http.post<DiagnosticCaseRecord>(`${this.apiUrl}/diagnostics`, payload);
  }

  analyzeDiagnosticCase(id: number): Observable<DiagnosticCaseRecord> {
    return this.http.post<DiagnosticCaseRecord>(`${this.apiUrl}/diagnostics/${id}/analyze`, {});
  }

  rateDiagnosticCase(id: number, payload: DiagnosticRatingPayload): Observable<DiagnosticCaseRecord> {
    return this.http.patch<DiagnosticCaseRecord>(`${this.apiUrl}/diagnostics/${id}/rating`, payload);
  }

  getDiagnosticCases(): Observable<DiagnosticCaseRecord[]> {
    return this.http.get<DiagnosticCaseRecord[]>(`${this.apiUrl}/diagnostics`);
  }

  getTicketServiceSettings(): Observable<TicketServiceSettings> {
    return this.http.get<TicketServiceSettings>(`${this.apiUrl}/settings/ticket-service`);
  }

  updateTicketServiceSettings(payload: TicketServiceSettingsPayload): Observable<TicketServiceSettings> {
    return this.http.put<TicketServiceSettings>(`${this.apiUrl}/settings/ticket-service`, payload);
  }

  getTroubleshootingTree(projectKey = 'default'): Observable<TroubleshootingTree> {
    return this.http.get<TroubleshootingTree>(
      `${this.apiUrl}/troubleshooting-tree?projectKey=${encodeURIComponent(projectKey || 'default')}`
    );
  }

  updateTroubleshootingTree(payload: TroubleshootingTree, projectKey = 'default'): Observable<TroubleshootingTree> {
    return this.http.put<TroubleshootingTree>(
      `${this.apiUrl}/troubleshooting-tree?projectKey=${encodeURIComponent(projectKey || 'default')}`,
      payload
    );
  }

  getExternalServices(): Observable<ExternalServiceRecord[]> {
    return this.http.get<ExternalServiceRecord[]>(`${this.apiUrl}/services`);
  }

  getActiveExternalServices(): Observable<PublicExternalServiceRecord[]> {
    return this.http.get<PublicExternalServiceRecord[]>(`${this.apiUrl}/services/active`);
  }

  createExternalService(payload: ExternalServicePayload): Observable<ExternalServiceRecord> {
    return this.http.post<ExternalServiceRecord>(`${this.apiUrl}/services`, payload);
  }

  updateExternalService(id: number, payload: ExternalServicePayload): Observable<ExternalServiceRecord> {
    return this.http.put<ExternalServiceRecord>(`${this.apiUrl}/services/${id}`, payload);
  }

  deleteExternalService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/services/${id}`);
  }

  testExternalService(id: number): Observable<ExternalServiceExecutionResult> {
    return this.http.post<ExternalServiceExecutionResult>(`${this.apiUrl}/services/${id}/test`, {});
  }

  runExternalService(id: number): Observable<ExternalServiceExecutionResult> {
    return this.http.post<ExternalServiceExecutionResult>(`${this.apiUrl}/services/${id}/run`, {});
  }
}
