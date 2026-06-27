import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConversationRecord, FaqRecord } from '../models/faq.models';
import { environment } from '../../../environments/environment';

export type FaqPayload = Pick<FaqRecord, 'question' | 'answer' | 'category' | 'keywords'>;

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

  importFaqs(payload: FaqPayload[]): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.apiUrl}/faqs/import`, payload);
  }

  getConversations(): Observable<ConversationRecord[]> {
    return this.http.get<ConversationRecord[]>(`${this.apiUrl}/conversations`);
  }

  logConversation(question: string, answer: string, matchedFaqId: number | null): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/conversations`, { question, answer, matchedFaqId });
  }
}
