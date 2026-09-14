import ExcelJS from 'exceljs';

/**
 * Converts an uploaded .xlsx/.xlsm workbook into CSV text so spreadsheet
 * exports (TikTok Ads hands out .xlsx by default) can run through the same
 * import pipeline as a .csv file.
 */
export class XlsxEngine {
  /** Formats a date as YYYY-MM-DD so it survives the trip through CSV unambiguously. */
  private static formatDate(value: Date): string {
    if (isNaN(value.getTime())) return '';
    const iso = value.toISOString();
    // Ad platform exports carry whole days; keep a time only when there is one.
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }

  private static cellToString(value: any): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return XlsxEngine.formatDate(value);
    if (typeof value === 'object') {
      // Formula cells carry their computed value, rich text its runs, links their caption.
      if ('result' in value) return XlsxEngine.cellToString((value as any).result);
      if ('richText' in value) return ((value as any).richText || []).map((r: any) => r.text).join('');
      if ('text' in value) return String((value as any).text);
      if ('error' in value) return '';
      return '';
    }
    return String(value);
  }

  private static toCsvField(value: string): string {
    if (value === '') return '';
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Reads the first worksheet of the workbook and returns it as CSV text.
   * Trailing empty columns/rows are dropped so the header row lines up with
   * the data rows.
   */
  static async convertToCsv(buffer: Buffer): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new Error('This file could not be read as an Excel workbook. Please upload a .xlsx export or save it as CSV.');
    }

    const sheet = workbook.worksheets.find(ws => ws.rowCount > 0) || workbook.worksheets[0];
    if (!sheet) throw new Error('The uploaded workbook has no sheets.');

    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map(v => XlsxEngine.cellToString(v));
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (!cells.length) return;
      lines.push(cells.map(c => XlsxEngine.toCsvField(c)).join(','));
    });

    if (!lines.length) throw new Error('The uploaded workbook has no readable rows.');
    return lines.join('\n');
  }
}
