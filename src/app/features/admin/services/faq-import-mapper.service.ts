import { Injectable } from '@angular/core';
import { FaqRow } from '../../../core/models/faq.models';
import { FaqPayload } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class FaqImportMapperService {
  mapRows(rows: FaqRow[]): FaqPayload[] {
    return rows.map((row) => this.mapRow(row)).filter((faq) => Boolean(faq.question && faq.answer));
  }

  private mapRow(row: FaqRow): FaqPayload {
    return {
      question: this.findValue(row, ['سؤال', 'سوال', 'پرسش', 'question']),
      answer: this.findValue(row, ['پاسخ', 'جواب', 'راهکار', 'answer']),
      category: this.findValue(row, ['دسته‌بندی', 'دسته بندی', 'موضوع', 'category']),
      keywords: this.findValue(row, ['کلمات کلیدی', 'کلیدواژه', 'keywords'])
    };
  }

  private findValue(row: FaqRow, candidates: string[]): string {
    const key = Object.keys(row).find((header) =>
      candidates.some((candidate) => this.normalize(header).includes(this.normalize(candidate)))
    );
    return key ? row[key] : '';
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
  }
}
