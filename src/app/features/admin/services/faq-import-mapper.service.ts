import { Injectable } from '@angular/core';
import { FaqRow } from '../../../core/models/faq.models';
import { FaqPayload } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class FaqImportMapperService {
  mapRows(rows: FaqRow[]): FaqPayload[] {
    return rows.map((row) => this.mapRow(row)).filter((faq) => Boolean(faq.question && faq.answer));
  }

  mapWordText(text: string): FaqPayload[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\u200c/g, ' ').trim();
    if (!normalized) return [];

    const blocks = normalized
      .split(/\n\s*(?:---+|#{2,}|\*{3,})\s*\n|\n\s*\n(?=\s*(?:سؤال|سوال|پرسش|question|q)\s*[:：])/i)
      .map((block) => block.trim())
      .filter(Boolean);

    const payload = blocks.map((block) => this.mapWordBlock(block)).filter((faq) => faq.question && faq.answer);
    return payload.length ? payload : this.mapPlainQuestionAnswerPairs(normalized);
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

  private mapWordBlock(block: string): FaqPayload {
    return {
      question: this.extractField(block, ['سؤال', 'سوال', 'پرسش', 'question', 'q']),
      answer: this.extractField(block, ['پاسخ', 'جواب', 'راهکار', 'answer', 'a']),
      category: this.extractField(block, ['دسته‌بندی', 'دسته بندی', 'موضوع', 'category']) || 'Word',
      keywords: this.extractField(block, ['کلمات کلیدی', 'کلیدواژه', 'keywords', 'tags'])
    };
  }

  private mapPlainQuestionAnswerPairs(text: string): FaqPayload[] {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const payload: FaqPayload[] = [];

    for (let index = 0; index < lines.length - 1; index += 2) {
      payload.push({
        question: lines[index],
        answer: lines[index + 1],
        category: 'Word',
        keywords: ''
      });
    }

    return payload.filter((faq) => faq.question && faq.answer);
  }

  private extractField(block: string, labels: string[]): string {
    const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const nextLabel =
      '(?:سؤال|سوال|پرسش|question|q|پاسخ|جواب|راهکار|answer|a|دسته‌بندی|دسته بندی|موضوع|category|کلمات کلیدی|کلیدواژه|keywords|tags)';
    const expression = new RegExp(
      `(?:^|\\n)\\s*(?:${escapedLabels})\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*${nextLabel}\\s*[:：]|$)`,
      'i'
    );
    return expression.exec(block)?.[1]?.trim() ?? '';
  }
}
