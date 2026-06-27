import { Injectable } from '@angular/core';
import { FaqRow } from '../../../core/models/faq.models';
import { FaqPayload } from '../../../core/services/api.service';

type FaqDraft = {
  question: string[];
  description: string[];
  solution: string[];
  category: string;
  mode: 'question' | 'description' | 'solution';
};

const QUESTION_LABELS = [
  '\u0633\u0624\u0627\u0644',
  '\u0633\u0648\u0627\u0644',
  '\u067e\u0631\u0633\u0634',
  'question',
  'q'
];
const ANSWER_LABELS = [
  '\u067e\u0627\u0633\u062e',
  '\u062c\u0648\u0627\u0628',
  '\u0631\u0627\u0647\u06a9\u0627\u0631',
  'answer',
  'a'
];
const ERROR_LABELS = ['\u0645\u062a\u0646 \u062e\u0637\u0627', '\u062e\u0637\u0627', 'error'];
const DESCRIPTION_LABELS = [
  '\u062a\u0648\u0636\u06cc\u062d\u0627\u062a',
  '\u0634\u0631\u062d',
  'description'
];
const SOLUTION_LABELS = [
  '\u0631\u0627\u0647 \u062d\u0644',
  '\u0631\u0627\u0647\u200c\u062d\u0644',
  '\u0631\u0627\u0647\u06a9\u0627\u0631',
  'solution'
];
const CATEGORY_LABELS = [
  '\u062f\u0633\u062a\u0647\u200c\u0628\u0646\u062f\u06cc',
  '\u062f\u0633\u062a\u0647 \u0628\u0646\u062f\u06cc',
  '\u0645\u0648\u0636\u0648\u0639',
  'category'
];
const KEYWORD_LABELS = [
  '\u06a9\u0644\u0645\u0627\u062a \u06a9\u0644\u06cc\u062f\u06cc',
  '\u06a9\u0644\u06cc\u062f\u0648\u0627\u0698\u0647',
  'keywords',
  'tags'
];
const ALL_LABELS = [
  ...QUESTION_LABELS,
  ...ANSWER_LABELS,
  ...ERROR_LABELS,
  ...DESCRIPTION_LABELS,
  ...SOLUTION_LABELS,
  ...CATEGORY_LABELS,
  ...KEYWORD_LABELS
];

@Injectable({ providedIn: 'root' })
export class FaqImportMapperService {
  mapRows(rows: FaqRow[]): FaqPayload[] {
    return rows.map((row) => this.mapRow(row)).filter((faq) => Boolean(faq.question && faq.answer));
  }

  mapWordText(text: string): FaqPayload[] {
    const normalized = this.normalizeDocumentText(text);
    if (!normalized) return [];

    return (
      this.mapTableLikeTroubleshootingDocument(normalized) ||
      this.mapNumberedTroubleshootingDocument(normalized) ||
      this.mapLabeledQuestionAnswerDocument(normalized) ||
      this.mapQuestionMarkDocument(normalized) ||
      this.mapParagraphBlocks(normalized)
    );
  }

  private mapRow(row: FaqRow): FaqPayload {
    return {
      question: this.findValue(row, QUESTION_LABELS),
      answer: this.findValue(row, ANSWER_LABELS),
      category: this.findValue(row, CATEGORY_LABELS),
      keywords: this.findValue(row, KEYWORD_LABELS)
    };
  }

  private findValue(row: FaqRow, candidates: string[]): string {
    const key = Object.keys(row).find((header) =>
      candidates.some((candidate) => this.normalize(header).includes(this.normalize(candidate)))
    );
    return key ? row[key] : '';
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\u064a\u0649]/g, '\u06cc')
      .replace(/\u0643/g, '\u06a9')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeDocumentText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\u200c/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private mapTableLikeTroubleshootingDocument(text: string): FaqPayload[] | null {
    const lines = this.cleanLines(text);
    const payload: FaqPayload[] = [];
    let category = 'Word';
    let current: FaqDraft | null = null;

    const flush = (): void => {
      if (!current) return;
      const question = current.question.join('\n').trim();
      const description = current.description.join('\n').trim();
      const solution = current.solution.join('\n').trim();
      const answer = [
        description && `\u062a\u0648\u0636\u06cc\u062d\u0627\u062a:\n${description}`,
        solution && `\u0631\u0627\u0647 \u062d\u0644:\n${solution}`
      ]
        .filter(Boolean)
        .join('\n\n');

      if (question && answer) {
        payload.push({
          question,
          answer,
          category: current.category,
          keywords: this.buildKeywords(question, current.category)
        });
      }
      current = null;
    };

    for (const rawLine of lines) {
      const line = this.stripDecorations(rawLine);
      if (this.isTroubleshootingCategory(line)) {
        flush();
        category = line;
        continue;
      }

      const itemStart = this.matchLeadingNumberedField(line, ERROR_LABELS);
      if (itemStart) {
        flush();
        current = { question: [itemStart], description: [], solution: [], category, mode: 'question' };
        continue;
      }

      if (!current) continue;

      const description = this.matchLeadingField(line, DESCRIPTION_LABELS);
      if (description !== null) {
        current.mode = 'description';
        if (description) current.description.push(description);
        continue;
      }

      const solution = this.matchLeadingField(line, SOLUTION_LABELS);
      if (solution !== null) {
        current.mode = 'solution';
        if (solution) current.solution.push(solution);
        continue;
      }

      if (current.mode === 'question') current.question.push(line);
      if (current.mode === 'description') current.description.push(line);
      if (current.mode === 'solution') current.solution.push(line);
    }

    flush();
    return payload.length ? payload : null;
  }

  private mapNumberedTroubleshootingDocument(text: string): FaqPayload[] | null {
    const lines = this.cleanLines(text);
    const numberIndexes = lines
      .map((line, index) => (/^[\u06f0-\u06f90-9]+[.)-]?$/.test(line) ? index : -1))
      .filter((index) => index >= 0);

    if (numberIndexes.length < 2) return null;

    const category = this.detectCategory(lines) || 'Word';
    const payload: FaqPayload[] = [];

    numberIndexes.forEach((start, position) => {
      const end = numberIndexes[position + 1] ?? lines.length;
      const blockLines = lines.slice(start + 1, end);
      const faq = this.mapTroubleshootingBlock(blockLines, category);
      if (faq) payload.push(faq);
    });

    return payload.length ? payload : null;
  }

  private mapTroubleshootingBlock(lines: string[], category: string): FaqPayload | null {
    const errorText = this.collectSection(lines, ERROR_LABELS);
    const description = this.collectSection(lines, DESCRIPTION_LABELS);
    const solution = this.collectSection(lines, SOLUTION_LABELS);
    const firstMeaningfulLine = lines.find((line) => !this.isSectionLabel(line) && !this.isIntroLine(line));
    const question = this.pickQuestion(errorText, firstMeaningfulLine);
    const answerParts = [description, solution].filter(Boolean);
    const answer = answerParts.length
      ? answerParts.join('\n\n')
      : lines.filter((line) => !this.isSectionLabel(line)).join('\n');

    if (!question || !answer || question === answer) return null;
    return { question, answer, category, keywords: this.buildKeywords(question, category) };
  }

  private mapLabeledQuestionAnswerDocument(text: string): FaqPayload[] | null {
    const questionPattern = this.labelsPattern(QUESTION_LABELS);
    const blocks = text
      .split(
        new RegExp(
          `\\n\\s*(?:---+|#{2,}|\\*{3,})\\s*\\n|\\n\\s*\\n(?=\\s*(?:${questionPattern})\\s*[:?])`,
          'i'
        )
      )
      .map((block) => block.trim())
      .filter(Boolean);

    const payload = blocks
      .map((block) => this.mapWordBlock(block))
      .filter((faq) => faq.question && faq.answer);
    return payload.length ? payload : null;
  }

  private mapQuestionMarkDocument(text: string): FaqPayload[] | null {
    const lines = this.cleanLines(text);
    const payload: FaqPayload[] = [];
    let currentQuestion = '';
    let answerLines: string[] = [];

    for (const line of lines) {
      if (this.looksLikeQuestion(line)) {
        this.flushQuestion(payload, currentQuestion, answerLines);
        currentQuestion = line;
        answerLines = [];
        continue;
      }
      if (currentQuestion && !this.isIntroLine(line)) answerLines.push(line);
    }
    this.flushQuestion(payload, currentQuestion, answerLines);

    return payload.length ? payload : null;
  }

  private mapParagraphBlocks(text: string): FaqPayload[] {
    return text
      .split(/\n\s*\n/g)
      .map((block) => this.cleanLines(block).filter((line) => !this.isIntroLine(line)))
      .map((lines) => {
        const question = lines.find((line) => this.looksLikeQuestion(line)) ?? lines[0] ?? '';
        const answer = lines.filter((line) => line !== question && !this.isSectionLabel(line)).join('\n');
        return { question, answer, category: 'Word', keywords: this.buildKeywords(question, 'Word') };
      })
      .filter((faq) => faq.question && faq.answer && faq.question !== faq.answer);
  }

  private mapWordBlock(block: string): FaqPayload {
    const question = this.extractField(block, QUESTION_LABELS);
    const answer = this.extractField(block, ANSWER_LABELS);
    return {
      question,
      answer,
      category: this.extractField(block, CATEGORY_LABELS) || 'Word',
      keywords: this.extractField(block, KEYWORD_LABELS) || this.buildKeywords(question, 'Word')
    };
  }

  private cleanLines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private collectSection(lines: string[], labels: string[]): string {
    const start = lines.findIndex((line) =>
      labels.some((label) => this.normalize(line) === this.normalize(label))
    );
    if (start < 0) return '';

    const collected: string[] = [];
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (this.isSectionLabel(line)) break;
      collected.push(line);
    }
    return collected.join('\n').trim();
  }

  private pickQuestion(errorText: string, fallback = ''): string {
    const errorLines = this.cleanLines(errorText);
    return errorLines.find((line) => !this.isSectionLabel(line)) || fallback;
  }

  private detectCategory(lines: string[]): string {
    return lines.find((line) => this.isTroubleshootingCategory(line) && line.length < 120) ?? '';
  }

  private stripDecorations(line: string): string {
    return line
      .replace(/^[\s\uF0FC\u2713\u2022\-\u2013\u2014]+/, '')
      .replace(/[\uF0FC\u2713\u2022]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isTroubleshootingCategory(line: string): boolean {
    const normalized = this.normalize(line);
    return (
      (normalized.includes('\u062e\u0637\u0627\u0647\u0627\u06cc') ||
        normalized.includes('sql') ||
        normalized.includes('oracle')) &&
      !ERROR_LABELS.some((label) => normalized.includes(this.normalize(label))) &&
      !DESCRIPTION_LABELS.some((label) => normalized.includes(this.normalize(label))) &&
      !SOLUTION_LABELS.some((label) => normalized.includes(this.normalize(label)))
    );
  }

  private isSectionLabel(line: string): boolean {
    const normalized = this.normalize(line).replace(/[:?]$/, '');
    return ALL_LABELS.some((label) => normalized === this.normalize(label));
  }

  private isIntroLine(line: string): boolean {
    const normalized = this.normalize(line);
    return [
      '\u0628\u0633\u0645\u0647',
      '\u0628\u0633\u0645\u0647 \u062a\u0639\u0627\u0644\u06cc',
      '\u067e\u0631\u0633\u0634 \u0647\u0627\u06cc \u0645\u062a\u062f\u0627\u0648\u0644',
      '\u067e\u0631\u0633\u0634\u200c\u0647\u0627\u06cc \u0645\u062a\u062f\u0627\u0648\u0644'
    ].some((item) => normalized === this.normalize(item));
  }

  private looksLikeQuestion(line: string): boolean {
    return /[\u061f?]$/.test(line) || this.matchLeadingField(line, QUESTION_LABELS) !== null;
  }

  private flushQuestion(payload: FaqPayload[], question: string, answerLines: string[]): void {
    const answer = answerLines
      .filter((line) => !this.isSectionLabel(line))
      .join('\n')
      .trim();
    if (question && answer) {
      payload.push({ question, answer, category: 'Word', keywords: this.buildKeywords(question, 'Word') });
    }
  }

  private buildKeywords(question: string, category: string): string {
    return [
      category,
      ...question
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .slice(0, 5)
    ]
      .filter(Boolean)
      .join('\u060c ');
  }

  private matchLeadingNumberedField(line: string, labels: string[]): string | null {
    const expression = new RegExp(
      `^[\\u06f0-\\u06f90-9]+[.)-]?\\s+(?:${this.labelsPattern(labels)})\\s*[:?-]?\\s*(.+)$`,
      'i'
    );
    return expression.exec(line)?.[1]?.trim() ?? null;
  }

  private matchLeadingField(line: string, labels: string[]): string | null {
    const expression = new RegExp(`^(?:${this.labelsPattern(labels)})\\s*[:?-]?\\s*(.*)$`, 'i');
    const match = expression.exec(line);
    return match ? match[1].trim() : null;
  }

  private extractField(block: string, labels: string[]): string {
    const expression = new RegExp(
      `(?:^|\\n)\\s*(?:${this.labelsPattern(labels)})\\s*[:?]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${this.labelsPattern(ALL_LABELS)})\\s*[:?]|$)`,
      'i'
    );
    return expression.exec(block)?.[1]?.trim() ?? '';
  }

  private labelsPattern(labels: string[]): string {
    return labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  }
}
