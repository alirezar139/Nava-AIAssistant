import { Injectable } from '@angular/core';
import { FaqAnswer, FaqRow } from '../models/faq.models';

@Injectable({ providedIn: 'root' })
export class FaqSearchService {
  search(rows: FaqRow[], question: string, limit = 3): FaqAnswer[] {
    const query = this.normalize(question);
    const tokens = query.split(' ').filter((token) => token.length > 1);
    if (!tokens.length) return [];

    return rows
      .map((row) => {
        const searchable = this.normalize(Object.values(row).join(' '));
        const hits = tokens.filter((token) => searchable.includes(token)).length;
        return {
          row,
          score: hits / tokens.length + (searchable.includes(query) ? 1 : 0)
        };
      })
      .filter(({ score }) => score >= Math.max(0.34, 1 / tokens.length))
      .sort((first, second) => second.score - first.score)
      .slice(0, limit)
      .map(({ row, score }) => ({
        title: this.pickValue(row, ['سوال', 'سؤال', 'عنوان', 'موضوع', 'نام سامانه']) || 'نتیجه مرتبط',
        text: this.pickValue(row, ['پاسخ', 'جواب', 'راهکار', 'توضیحات', 'شرح']) || this.formatRow(row),
        score
      }));
  }

  private pickValue(row: FaqRow, candidates: string[]): string {
    const key = Object.keys(row).find((header) =>
      candidates.some((candidate) => this.normalize(header).includes(this.normalize(candidate)))
    );
    return key ? row[key] : '';
  }

  private formatRow(row: FaqRow): string {
    return Object.entries(row)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
  }

  private normalize(value: string): string {
    return value
      .toLocaleLowerCase('fa')
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
