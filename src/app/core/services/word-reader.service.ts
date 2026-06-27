import { Injectable } from '@angular/core';
import { extractRawText } from 'mammoth/mammoth.browser';

@Injectable({ providedIn: 'root' })
export class WordReaderService {
  async read(file: File): Promise<string> {
    if (!/\.docx$/i.test(file.name)) {
      throw new Error('INVALID_WORD_FILE');
    }

    const result = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = result.value.trim();
    if (!text) throw new Error('EMPTY_WORD_FILE');

    return text;
  }
}
