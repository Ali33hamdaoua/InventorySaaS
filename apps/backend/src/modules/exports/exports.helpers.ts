import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import puppeteer, { Browser } from 'puppeteer';

/* ============================================================
   PDF rendering — singleton headless Chromium via Puppeteer.
   Launch is lazy so unrelated requests don't pay the cold-start.

   Production (Docker, node:20 / Debian Bookworm):
     Puppeteer's bundled Chromium (downloaded by `pnpm install` postinstall)
     is used directly — no `PUPPETEER_EXECUTABLE_PATH` needed. The Dockerfile
     `apt-get install`s the runtime libs Chromium depends on (libnss3,
     libgbm1, libatk1.0-0, libgtk-3-0, fonts-*, …). Without those libs the
     binary loads but every launch throws → 500 on every PDF export.

   Override path:
     If `PUPPETEER_EXECUTABLE_PATH` is set we honour it (escape hatch for a
     system Chromium / Chrome / Edge install).

   Local dev: env var unset, Puppeteer uses its bundled Chromium.
   ============================================================ */

const pdfLogger = new Logger('PdfRenderer');
let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  pdfLogger.log(
    `Launching Chromium (${executablePath ?? 'bundled'})…`,
  );
  try {
    cachedBrowser = await puppeteer.launch({
      headless: true,
      executablePath,
      // Minimal flag set. Puppeteer's defaults already cover headless rendering.
      //   --no-sandbox            → required when running as root in Docker
      //   --disable-setuid-sandbox → matches the above
      //   --disable-dev-shm-usage → /dev/shm is tiny in Docker; use /tmp instead
      //   --disable-gpu           → safe perf hint for headless
      //
      // NOT included (intentionally):
      //   --single-process / --no-zygote → ran the renderer + browser in one
      //     process, which crashed Chromium on every non-trivial PDF
      //     ("Protocol error: Connection closed"). Removing them fixed the
      //     dev-loop 500. Don't add them back unless you have a strong reason.
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    cachedBrowser.on('disconnected', () => {
      pdfLogger.warn('Chromium disconnected — cache invalidated.');
      cachedBrowser = null;
    });
    return cachedBrowser;
  } catch (e) {
    pdfLogger.error(
      `Chromium failed to launch (executablePath=${executablePath ?? 'bundled'}): ${
        (e as Error).message
      }`,
      (e as Error).stack,
    );
    throw e;
  }
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    // Swallow close errors so the real exception (if any) bubbles up. The
    // common case here is the browser process already crashed, in which case
    // page.close() throws "Protocol error: Connection closed" and would mask
    // the original failure if not caught.
    await page.close().catch(() => {});
  }
}

/* ============================================================
   Currency / date / filter formatting helpers
   ============================================================ */

const CAD = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
});
const PCT = new Intl.NumberFormat('fr-CA', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const DATE = new Intl.DateTimeFormat('fr-CA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function fmtCurrency(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? CAD.format(n) : '—';
}
export function fmtPct(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? PCT.format(n / 100) : '—';
}
export function fmtDate(v: unknown): string {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return '—';
  return DATE.format(d);
}
export function fmtNumber(v: unknown, digits = 2): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString('fr-CA', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : '—';
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================================
   Generic Excel builder
   ============================================================ */

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  /** Cell value extractor. Returning a number lets Excel apply numFmt. */
  value: (row: T) => string | number | Date | null | undefined;
  /** Optional Excel number format (e.g. '#,##0.00 "$"'). */
  numFmt?: string;
  alignment?: Partial<ExcelJS.Alignment>;
}

export interface ExcelExportSpec<T> {
  sheetName: string;
  title: string;
  /** Free-form filter summary lines printed above the header row. */
  appliedFilters?: string[];
  columns: ExcelColumn<T>[];
  rows: T[];
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function buildExcel<T>(spec: ExcelExportSpec<T>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventory MDB';
  wb.company = 'La Maison du Burger';
  wb.created = new Date();

  const ws = wb.addWorksheet(spec.sheetName);
  const lastCol = colLetter(spec.columns.length);

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = spec.title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFED312E' } };

  // Subtitle
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').value = `Généré le ${DATE.format(new Date())} — Inventory MDB · La Maison du Burger`;
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF888888' } };

  // Filters (one row per filter)
  let row = 3;
  for (const f of spec.appliedFilters ?? []) {
    ws.mergeCells(`A${row}:${lastCol}${row}`);
    ws.getCell(`A${row}`).value = `· ${f}`;
    ws.getCell(`A${row}`).font = { size: 10, color: { argb: 'FF555555' } };
    row++;
  }
  row++; // blank line

  // Header row
  const headerRow = ws.getRow(row);
  spec.columns.forEach((c, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED312E' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: c.alignment?.horizontal ?? 'left',
    };
  });
  headerRow.commit();
  const headerRowNum = row;
  row++;

  // Data rows
  for (const r of spec.rows) {
    const dataRow = ws.getRow(row);
    spec.columns.forEach((c, idx) => {
      const cell = dataRow.getCell(idx + 1);
      const v = c.value(r);
      cell.value = v ?? '';
      if (c.numFmt) cell.numFmt = c.numFmt;
      if (c.alignment) cell.alignment = c.alignment;
    });
    dataRow.commit();
    row++;
  }

  // Freeze pane just below the header
  ws.views = [{ state: 'frozen', ySplit: headerRowNum }];

  // Column widths
  spec.columns.forEach((c, idx) => {
    ws.getColumn(idx + 1).width = c.width ?? 18;
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ============================================================
   Generic PDF HTML template
   ============================================================ */

export interface PdfColumn<T> {
  header: string;
  value: (row: T) => string;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

export interface PdfExportSpec<T> {
  title: string;
  appliedFilters?: string[];
  columns: PdfColumn<T>[];
  rows: T[];
  /** Optional totals row appended at the end of the table. */
  totalsRow?: { label: string; cells: (string | null)[] };
}

function pdfBaseStyle() {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #0a0a0a;
      margin: 0;
      padding: 0;
      font-size: 11px;
    }
    .title {
      color: #ED312E;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0 0 4px;
    }
    .subtitle {
      color: #666;
      font-size: 10px;
      margin: 0 0 16px;
    }
    .filters {
      border: 1px solid #e6e6e6;
      background: #fafafa;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 10px;
      color: #444;
    }
    .filters strong {
      color: #0a0a0a;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 9px;
      display: block;
      margin-bottom: 4px;
    }
    .filters ul { margin: 0; padding-left: 16px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    thead th {
      background: #ED312E;
      color: #fff;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      font-size: 9.5px;
      text-transform: uppercase;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #fafafa; }
    tbody td.num, thead th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.center, thead th.center { text-align: center; }
    tfoot td {
      padding: 9px 10px;
      border-top: 2px solid #ED312E;
      font-weight: 700;
      background: #fff8f8;
    }
    .empty {
      text-align: center;
      color: #888;
      padding: 24px;
      font-style: italic;
    }
  `;
}

export function renderPdfHtml<T>(spec: PdfExportSpec<T>): string {
  const filters = spec.appliedFilters?.length
    ? `<div class="filters">
        <strong>Filtres appliqués</strong>
        <ul>${spec.appliedFilters.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      </div>`
    : '';

  const headerCells = spec.columns
    .map(
      (c) =>
        `<th class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}" style="${
          c.width ? `width:${c.width};` : ''
        }">${escapeHtml(c.header)}</th>`,
    )
    .join('');

  const body = spec.rows.length
    ? spec.rows
        .map(
          (r) =>
            `<tr>${spec.columns
              .map(
                (c) =>
                  `<td class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}">${escapeHtml(
                    String(c.value(r) ?? ''),
                  )}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="${spec.columns.length}">Aucune ligne ne correspond aux filtres appliqués.</td></tr>`;

  const totals = spec.totalsRow
    ? `<tfoot><tr>
        <td colspan="${Math.max(1, spec.columns.length - spec.totalsRow.cells.length)}">${escapeHtml(spec.totalsRow.label)}</td>
        ${spec.totalsRow.cells
          .map(
            (c, idx) =>
              `<td class="${spec.columns[spec.columns.length - spec.totalsRow!.cells.length + idx]?.align === 'right' ? 'num' : ''}">${escapeHtml(
                c ?? '',
              )}</td>`,
          )
          .join('')}
      </tr></tfoot>`
    : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>${pdfBaseStyle()}</style>
</head>
<body style="padding: 18mm 14mm;">
  <h1 class="title">${escapeHtml(spec.title)}</h1>
  <div class="subtitle">Généré le ${escapeHtml(DATE.format(new Date()))} — Inventory MDB · La Maison du Burger</div>
  ${filters}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${body}</tbody>
    ${totals}
  </table>
</body>
</html>`;
}

/** One-shot helper: build HTML then PDF. */
export async function buildPdf<T>(spec: PdfExportSpec<T>): Promise<Buffer> {
  return renderPdfFromHtml(renderPdfHtml(spec));
}

/* ============================================================
   File naming
   ============================================================ */

export function isoStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
