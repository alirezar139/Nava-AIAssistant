import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DiagnosticCaseRecord, DiagnosticPayload } from '../models/diagnostic.models';
import { ConversationRecord, FaqRecord } from '../models/faq.models';
import { environment } from '../../../environments/environment';

export type FaqPayload = Pick<FaqRecord, 'question' | 'answer' | 'category' | 'keywords'>;

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

  logConversation(question: string, answer: string, matchedFaqId: number | null): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/conversations`, { question, answer, matchedFaqId });
  }

  createDiagnosticCase(payload: DiagnosticPayload): Observable<DiagnosticCaseRecord> {
    return this.http.post<DiagnosticCaseRecord>(`${this.apiUrl}/diagnostics`, payload);
  }

  analyzeDiagnosticCase(id: number): Observable<DiagnosticCaseRecord> {
    return this.http.post<DiagnosticCaseRecord>(`${this.apiUrl}/diagnostics/${id}/analyze`, {});
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
}
