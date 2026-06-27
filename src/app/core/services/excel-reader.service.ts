import { Injectable } from '@angular/core';
import { readSheet } from 'read-excel-file/browser';
import { FaqDataset, FaqRow } from '../models/faq.models';

@Injectable({ providedIn: 'root' })
export class ExcelReaderService {
  read(file: File): Promise<FaqDataset> {
    if (!/\.xlsx$/i.test(file.name)) {
      return Promise.reject(new Error('INVALID_FILE_TYPE'));
    }

    return readSheet(file).then((sheetRows) => {
      const [headerRow, ...dataRows] = sheetRows;
      if (!headerRow?.length || !dataRows.length) throw new Error('EMPTY_WORKBOOK');

      const headers = headerRow.map((value, index) => String(value ?? '').trim() || `ستون ${index + 1}`);
      const rows: FaqRow[] = dataRows
        .filter((row) => row.some((value) => value !== null && String(value).trim()))
        .map((row) =>
          Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()]))
        );
      if (!rows.length) throw new Error('EMPTY_WORKBOOK');

      return { rows, headers, fileName: file.name, sheetName: 'برگه اول' };
    });
  }
}
