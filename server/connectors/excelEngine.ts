import path from 'node:path';
import ExcelJS from 'exceljs';
import type { DetectedColumnType } from './jiraConnector.ts';

export type ExcelTemplateType = 'project' | 'task' | 'wbs' | 'resource' | 'risk' | 'all';

const DANGEROUS_FORMULA_PREFIX = /^[=+@\t\r]/;
const DANGEROUS_MINUS_CALL = /^-[A-Za-z_@=+(]/;

export function sanitizeSpreadsheetValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (DANGEROUS_FORMULA_PREFIX.test(trimmed) || DANGEROUS_MINUS_CALL.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function inferCellDisplayValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('result' in obj && obj.result !== undefined) {
      return inferCellDisplayValue(obj.result);
    }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return sanitizeSpreadsheetValue(
        (obj.richText as Array<{ text?: string }>).map(t => t.text || '').join('')
      );
    }
    if ('text' in obj && typeof obj.text === 'string') {
      return sanitizeSpreadsheetValue(obj.text);
    }
    if ('hyperlink' in obj && typeof obj.hyperlink === 'string') {
      return sanitizeSpreadsheetValue(obj.text ? String(obj.text) : obj.hyperlink);
    }
    return sanitizeSpreadsheetValue(JSON.stringify(obj));
  }
  return typeof raw === 'string' ? sanitizeSpreadsheetValue(raw) : raw;
}

function latinizeDigits(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660));
}

function detectColumnType(values: unknown[], colName: string): DetectedColumnType {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  const lowerName = colName.toLowerCase();
  if (/email|ایمیل|پست/i.test(lowerName)) return 'email';
  if (/status|state|وضعیت|مرحله/i.test(lowerName)) return 'status';
  if (/date|deadline|due|start|تاریخ|موعد|شروع|پایان/i.test(lowerName)) return 'date';
  if (/label|tag|component|برچسب|تگ/i.test(lowerName)) return 'list';
  if (nonEmpty.length === 0) return 'text';

  let numCount = 0;
  let dateCount = 0;
  let emailCount = 0;
  for (const val of nonEmpty.slice(0, 25)) {
    if (typeof val === 'number') {
      numCount++;
      continue;
    }
    const str = latinizeDigits(String(val).trim());
    if (/^-?\d+(\.\d+)?$/.test(str)) {
      numCount++;
      continue;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      emailCount++;
      continue;
    }
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str)) {
      dateCount++;
    }
  }

  const ratio = (c: number) => c / Math.min(25, nonEmpty.length);
  if (ratio(emailCount) >= 0.6) return 'email';
  if (ratio(dateCount) >= 0.6) return 'date';
  if (ratio(numCount) >= 0.75) return 'number';
  return 'text';
}

function decodeCsvBuffer(buffer: Buffer): { text: string; encoding: string } {
  // Check UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'UTF-8 (BOM)' };
  }
  const utf8Text = buffer.toString('utf8');
  if (!utf8Text.includes('\uFFFD')) {
    return { text: utf8Text, encoding: 'UTF-8' };
  }
  try {
    const decoder = new TextDecoder('windows-1256');
    return { text: decoder.decode(buffer), encoding: 'Windows-1256 (Persian)' };
  } catch {
    return { text: utf8Text, encoding: 'UTF-8' };
  }
}

function parseDelimiterAwareCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount >= semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

function detectHeaderRowIndex(matrix: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(10, matrix.length);
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] || [];
    const nonEmpty = row.filter(c => String(c || '').trim() !== '');
    if (nonEmpty.length === 0) continue;
    const textCells = nonEmpty.filter(c => !/^-?\d+(\.\d+)?$/.test(latinizeDigits(String(c).trim())));
    const uniqueRatio = new Set(nonEmpty.map(c => c.toLowerCase())).size / nonEmpty.length;
    const score = textCells.length * 2 + uniqueRatio * 3 - r * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  return bestIdx; // 0-indexed
}

function detectDuplicateKeys(headers: string[], rows: Array<Record<string, unknown>>): string[] {
  const keyHeader = headers.find(h =>
    /^(key|issue\s*key|project\s*key|wbs\s*code|wbs|code|id|کد|شناسه)$/i.test(h.trim())
  );
  if (!keyHeader) return [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const r of rows) {
    const val = String(r[keyHeader] ?? '').trim();
    if (!val) continue;
    const norm = val.toUpperCase();
    if (seen.has(norm)) duplicates.add(val);
    seen.add(norm);
  }
  return Array.from(duplicates);
}

export async function parseExcelOrCsvBuffer(params: {
  fileName: string;
  base64Data: string;
  headerRowOverride?: number; // 1-indexed
}) {
  const cleanName = path.basename(String(params.fileName)).slice(0, 200);
  const ext = path.extname(cleanName).toLowerCase();
  const buffer = Buffer.from(params.base64Data, 'base64');

  if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    throw new Error('File must be non-empty and under 10 MB.');
  }

  const isLegacyXlsMagic =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  if (isLegacyXlsMagic || ext === '.xls') {
    const err = new Error(
      'Legacy binary .xls (Excel 97-2003) detected. Please save the workbook as .xlsx or .csv in Excel and upload again.'
    ) as Error & { code?: string };
    err.code = 'UNSUPPORTED_LEGACY_XLS';
    throw err;
  }

  const isZipMagic = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const detectedFormat: 'XLSX' | 'CSV' = ext === '.csv' && !isZipMagic ? 'CSV' : 'XLSX';
  let detectedEncoding: string | undefined;

  const sheets: Array<{
    name: string;
    headerRowUsed: number;
    detectedHeaderRow: number;
    rowCount: number;
    duplicateKeys: string[];
    columns: Array<{ key: string; label: string; type: DetectedColumnType }>;
    rows: Array<Record<string, unknown>>;
    rawPreviewMatrix: string[][];
  }> = [];

  const finalizeMatrix = (sheetName: string, matrix: unknown[][]) => {
    if (matrix.length === 0) return;
    const strMatrix = matrix.map(r => r.map(c => (c === null || c === undefined ? '' : String(c).trim())));
    const detectedZeroIdx = detectHeaderRowIndex(strMatrix);
    const chosenZeroIdx =
      typeof params.headerRowOverride === 'number' &&
      params.headerRowOverride >= 1 &&
      params.headerRowOverride <= strMatrix.length
        ? params.headerRowOverride - 1
        : detectedZeroIdx;

    const rawHeaders = strMatrix[chosenZeroIdx] || [];
    const maxCols = Math.max(
      rawHeaders.length,
      ...strMatrix.slice(0, 12).map(r => r.length)
    );
    const headers: string[] = [];
    const seenHeaders = new Set<string>();

    for (let c = 0; c < maxCols; c++) {
      let label = String(rawHeaders[c] ?? '').trim();
      if (!label) label = `Column_${c + 1}`;
      if (seenHeaders.has(label)) {
        label = `${label}_${c + 1}`;
      }
      seenHeaders.add(label);
      headers.push(label);
    }

    const dataRows: Array<Record<string, unknown>> = [];
    for (let r = chosenZeroIdx + 1; r < matrix.length; r++) {
      const rowArr = matrix[r] || [];
      const obj: Record<string, unknown> = {};
      let hasVal = false;
      headers.forEach((h, idx) => {
        const val = rowArr[idx];
        const sanitized = typeof val === 'string' ? sanitizeSpreadsheetValue(val) : val;
        if (sanitized !== null && sanitized !== undefined && String(sanitized).trim() !== '') {
          hasVal = true;
        }
        obj[h] = sanitized ?? '';
      });
      if (hasVal) dataRows.push(obj);
    }

    const columns = headers.map(h => ({
      key: h,
      label: h,
      type: detectColumnType(dataRows.map(r => r[h]), h),
    }));

    sheets.push({
      name: sheetName,
      headerRowUsed: chosenZeroIdx + 1,
      detectedHeaderRow: detectedZeroIdx + 1,
      rowCount: dataRows.length,
      duplicateKeys: detectDuplicateKeys(headers, dataRows),
      columns,
      rows: dataRows,
      rawPreviewMatrix: strMatrix.slice(0, 12).map(r => r.slice(0, 14)),
    });
  };

  if (detectedFormat === 'CSV') {
    const decoded = decodeCsvBuffer(buffer);
    detectedEncoding = decoded.encoding;
    const matrix = parseDelimiterAwareCsv(decoded.text);
    finalizeMatrix(path.basename(cleanName, ext) || 'CSV_Data', matrix);
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    for (const ws of workbook.worksheets) {
      if (ws.rowCount === 0) continue;
      const maxCol = Math.min(40, ws.columnCount || 20);
      const matrix: unknown[][] = [];
      for (let rIdx = 1; rIdx <= ws.rowCount; rIdx++) {
        const row = ws.getRow(rIdx);
        const rowArr: unknown[] = [];
        let hasAny = false;
        for (let cIdx = 1; cIdx <= maxCol; cIdx++) {
          const val = inferCellDisplayValue(row.getCell(cIdx).value);
          if (val !== null && String(val).trim() !== '') hasAny = true;
          rowArr.push(val ?? '');
        }
        if (hasAny) matrix.push(rowArr);
      }
      finalizeMatrix(ws.name, matrix);
    }
  }

  if (sheets.length === 0) {
    throw new Error('No readable worksheets or header columns were found in this file.');
  }

  return {
    fileName: cleanName,
    detectedFormat,
    detectedEncoding,
    sheetCount: sheets.length,
    sheets,
  };
}

function styleTemplateSheet(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  hdr.height = 24;
  ws.columns.forEach(col => {
    col.width = Math.max(18, (col.header?.length || 12) + 6);
  });
}

function addGuideSheet(workbook: ExcelJS.Workbook, templateType: ExcelTemplateType) {
  const guide = workbook.addWorksheet('Guide - راهنما');
  guide.columns = [
    { header: 'Field / ستون', key: 'field' },
    { header: 'Requirement / وضعیت', key: 'req' },
    { header: 'Accepted Format / فرمت مجاز', key: 'format' },
    { header: 'Example / نمونه', key: 'example' },
  ];
  guide.addRow({
    field: `Template: ${templateType.toUpperCase()}`,
    req: 'Information',
    format: 'UTF-8 XLSX (No Macros)',
    example: 'Upload directly via JiraFlow Integration Center',
  });
  guide.addRow({
    field: 'Dates (تاریخ‌ها)',
    req: 'Gregorian ISO or Jalali',
    format: 'YYYY-MM-DD or YYYY/MM/DD (Jalali 1300-1500 auto-converted)',
    example: '2026-12-05 or 1405/09/14',
  });
  guide.addRow({
    field: 'WBS & Hierarchy',
    req: 'Parent-child tree',
    format: 'Dot-separated codes (1, 1.1, 1.1.1) or Parent Key',
    example: '1.2 -> Parent 1',
  });
  guide.addRow({
    field: 'Formula Safety',
    req: 'Plain values only',
    format: 'Active executable macros and formulas are sanitized on import',
    example: '1500000',
  });
  styleTemplateSheet(guide);
}

export async function buildExcelTemplateBuffer(templateType: ExcelTemplateType = 'all'): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JiraFlow Integration Center';
  workbook.created = new Date();

  const include = (t: Exclude<ExcelTemplateType, 'all'>) => templateType === 'all' || templateType === t;

  if (include('project')) {
    const sheet = workbook.addWorksheet('Projects - پروژه‌ها');
    sheet.columns = [
      { header: 'Project Key', key: 'key' },
      { header: 'Project Name', key: 'name' },
      { header: 'Persian Name', key: 'nameFa' },
      { header: 'Category', key: 'category' },
      { header: 'Template', key: 'template' },
      { header: 'Lead Email', key: 'lead' },
      { header: 'Budget Allocated', key: 'budgetAllocated' },
      { header: 'Budget Spent', key: 'budgetSpent' },
      { header: 'Currency', key: 'currency' },
      { header: 'Description', key: 'description' },
    ];
    sheet.addRow({
      key: 'FIN',
      name: 'Finance Automation',
      nameFa: 'اتوماسیون مالی',
      category: 'Finance & Operations',
      template: 'scrum',
      lead: 'ali@jiraflow.ir',
      budgetAllocated: 450000,
      budgetSpent: 120000,
      currency: 'USD',
      description: 'Quarter 4 financial ledger and reconciliation initiatives.',
    });
    styleTemplateSheet(sheet);
  }

  if (include('task')) {
    const sheet = workbook.addWorksheet('Tasks - کارها و اسپرینت');
    sheet.columns = [
      { header: 'Key', key: 'key' },
      { header: 'Type', key: 'type' },
      { header: 'Summary', key: 'summary' },
      { header: 'Description', key: 'description' },
      { header: 'Status', key: 'status' },
      { header: 'Priority', key: 'priority' },
      { header: 'Assignee', key: 'assignee' },
      { header: 'Story Points', key: 'storyPoints' },
      { header: 'Original Estimate (min)', key: 'originalEstimateMinutes' },
      { header: 'Remaining Estimate (min)', key: 'remainingEstimateMinutes' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Due Date', key: 'dueDate' },
      { header: 'Labels', key: 'labels' },
      { header: 'Epic', key: 'epic' },
      { header: 'Parent Key', key: 'parentKey' },
      { header: 'Dependency Key', key: 'dependencyKey' },
    ];
    sheet.addRow({
      key: 'IMP-101',
      type: 'Story',
      summary: 'Implement SSO SAML login gateway',
      description: 'Support Okta and Azure AD SAML 2.0 assertions.',
      status: 'در حال انجام',
      priority: 'High',
      assignee: 'sara@jiraflow.ir',
      storyPoints: 5,
      originalEstimateMinutes: 480,
      remainingEstimateMinutes: 240,
      startDate: '1405/09/01',
      dueDate: '1405/09/15',
      labels: 'security, auth',
      epic: 'Identity Modernization',
      parentKey: '',
      dependencyKey: '',
    });
    sheet.addRow({
      key: 'IMP-102',
      type: 'Subtask',
      summary: 'Validate SAML metadata XML signature',
      description: 'Verify X509 certificates before issuing session token.',
      status: 'انجام‌نشده',
      priority: 'Medium',
      assignee: 'ali@jiraflow.ir',
      storyPoints: 2,
      originalEstimateMinutes: 180,
      remainingEstimateMinutes: 180,
      startDate: '1405/09/03',
      dueDate: '1405/09/10',
      labels: 'security',
      epic: 'Identity Modernization',
      parentKey: 'IMP-101',
      dependencyKey: 'IMP-101',
    });
    styleTemplateSheet(sheet);
  }

  if (include('wbs')) {
    const sheet = workbook.addWorksheet('WBS & Milestones - ساختار شکست');
    sheet.columns = [
      { header: 'WBS Code', key: 'wbsCode' },
      { header: 'Key', key: 'key' },
      { header: 'Type', key: 'type' },
      { header: 'Summary', key: 'summary' },
      { header: 'Parent Key', key: 'parentKey' },
      { header: 'Dependency Key', key: 'dependencyKey' },
      { header: 'Assignee', key: 'assignee' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Due Date', key: 'dueDate' },
      { header: 'Estimated Cost', key: 'estimatedCost' },
      { header: 'Is Milestone', key: 'isMilestone' },
      { header: 'Status', key: 'status' },
    ];
    sheet.addRow({
      wbsCode: '1',
      key: 'WBS-1',
      type: 'Epic',
      summary: 'Phase 1: Core Infrastructure',
      parentKey: '',
      dependencyKey: '',
      assignee: 'ali@jiraflow.ir',
      startDate: '1405/09/01',
      dueDate: '1405/09/30',
      estimatedCost: 25000,
      isMilestone: 'false',
      status: 'In Progress',
    });
    sheet.addRow({
      wbsCode: '1.1',
      key: 'WBS-1.1',
      type: 'Task',
      summary: 'Provision Postgres Cluster & Failover',
      parentKey: 'WBS-1',
      dependencyKey: '',
      assignee: 'sara@jiraflow.ir',
      startDate: '1405/09/01',
      dueDate: '1405/09/14',
      estimatedCost: 12000,
      isMilestone: 'false',
      status: 'In Progress',
    });
    sheet.addRow({
      wbsCode: '1.2',
      key: 'WBS-1.2',
      type: 'Task',
      summary: 'Infrastructure Go-Live Gate',
      parentKey: 'WBS-1',
      dependencyKey: 'WBS-1.1',
      assignee: 'ali@jiraflow.ir',
      startDate: '1405/09/15',
      dueDate: '1405/09/15',
      estimatedCost: 0,
      isMilestone: 'true',
      status: 'To Do',
    });
    styleTemplateSheet(sheet);
  }

  if (include('resource')) {
    const sheet = workbook.addWorksheet('Resources - منابع');
    sheet.columns = [
      { header: 'Resource Name', key: 'name' },
      { header: 'Persian Name', key: 'nameFa' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
      { header: 'Department', key: 'department' },
      { header: 'Resource Kind', key: 'kind' },
      { header: 'Environment', key: 'environment' },
    ];
    sheet.addRow({
      name: 'Nadia Karimi',
      nameFa: 'نادیا کریمی',
      email: 'nadia@jiraflow.ir',
      role: 'developer',
      department: 'Platform Engineering',
      kind: 'User',
      environment: 'Production',
    });
    sheet.addRow({
      name: 'Redis Session Cluster',
      nameFa: 'کلاستر ردیس نشست‌ها',
      email: 'ops@jiraflow.ir',
      role: 'admin',
      department: 'SRE Infrastructure',
      kind: 'Asset',
      environment: 'Production',
    });
    styleTemplateSheet(sheet);
  }

  if (include('risk')) {
    const sheet = workbook.addWorksheet('Risks - ریسک‌ها');
    sheet.columns = [
      { header: 'Risk Code', key: 'key' },
      { header: 'Risk Title', key: 'title' },
      { header: 'Description', key: 'description' },
      { header: 'Category', key: 'category' },
      { header: 'Probability', key: 'probability' },
      { header: 'Impact', key: 'impact' },
      { header: 'Status', key: 'status' },
      { header: 'Owner Email', key: 'owner' },
      { header: 'Mitigation Plan', key: 'mitigationPlan' },
      { header: 'Due Date', key: 'dueDate' },
    ];
    sheet.addRow({
      key: 'RSK-01',
      title: 'Legacy API Rate Limit Bottleneck',
      description: 'External gateway throttles bursts above 100 req/min during initial migration.',
      category: 'Technical',
      probability: 'High',
      impact: 'High',
      status: 'Mitigating',
      owner: 'ali@jiraflow.ir',
      mitigationPlan: 'Use incremental cursor batching and Retry-After exponential backoff.',
      dueDate: '1405/09/20',
    });
    styleTemplateSheet(sheet);
  }

  addGuideSheet(workbook, templateType);

  const arrayBuf = await workbook.xlsx.writeBuffer();
  const fileName =
    templateType === 'all'
      ? 'jiraflow-standard-import-template.xlsx'
      : `jiraflow-${templateType}-template.xlsx`;

  return { buffer: Buffer.from(arrayBuf), fileName };
}
