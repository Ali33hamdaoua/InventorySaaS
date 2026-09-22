import { toast } from 'sonner';
import api from '@/lib/api';
import type { PeriodStatus } from '@inventorymdb/shared';
import type { ListProductsParams } from './products.service';
import type { ListCategoriesParams } from './categories.service';
import type { ListSuppliersParams } from './suppliers.service';
import type { ListPurchasesParams } from './purchases.service';
import type { ListAccountingExpensesParams } from './accounting.service';

export type ExportFormat = 'excel' | 'pdf';

const MIME: Record<ExportFormat, string> = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * Per-request timeout for exports. The global axios timeout (15s) was tripping
 * the larger PDF jobs on Safari because Puppeteer cold-start + render of a
 * 200-row template can take >15s on the small VM in production.
 *
 * 90s is conservative — long enough for any realistic export, short enough
 * that a genuinely stuck request still surfaces an error.
 */
const EXPORT_TIMEOUT_MS = 90_000;

/**
 * Tiny dev/Safari diagnostic. Logs are only emitted when the host is localhost
 * or when `?debugExports=1` is in the URL — production users never see them.
 */
function exportDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  return isLocal || window.location.search.includes('debugExports=1');
}

function exportLog(stage: string, payload: Record<string, unknown>): void {
  if (!exportDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[export ${stage}]`, payload);
}

/**
 * Strip diacritics + reserved filesystem chars so Safari/Mac stays happy.
 *
 * Safari rejects fancy chars in `Content-Disposition` filename AND in the
 * anchor's `download` attr. Using explicit Unicode escapes for the combining
 * diacriticals range avoids file-encoding fragility (the previous version
 * embedded the literal characters in the regex, which broke if the file was
 * ever re-saved with different encoding).
 */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .replace(/[^\w.\- ]+/g, '_') // anything outside word/dot/dash/space
      .replace(/\s+/g, '-')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'export'
  );
}

/** Try both `filename*=UTF-8''…` (RFC 5987) and `filename="…"` forms. */
function parseContentDispositionFilename(disposition: string): string | null {
  if (!disposition) return null;
  // RFC 5987 takes precedence — it's the only form that can carry UTF-8.
  const rfc5987 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (rfc5987?.[1]) {
    try {
      return decodeURIComponent(rfc5987[1].replace(/^"|"$/g, ''));
    } catch {
      return rfc5987[1].replace(/^"|"$/g, '');
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1] ?? null;
}

/** Pull a backend JSON error message out of a Blob (responseType: 'blob' makes
 *  errors come back as Blobs too — Safari users see a useless 500 otherwise). */
async function readBlobMessage(blob: Blob): Promise<string | null> {
  if (!blob || blob.size === 0) return null;
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === 'string') return parsed.message;
    if (Array.isArray(parsed?.message)) return parsed.message.join(', ');
  } catch {
    /* not JSON — ignore */
  }
  return null;
}

/**
 * Safari-safe browser download from a backend export endpoint.
 *
 * Why Safari needs special care:
 *   - `window.open(url)` / `location.href = url` to an API URL doesn't carry
 *     the Bearer token. Always go through `api.get(...)` (which the axios
 *     interceptor decorates with Authorization).
 *   - The `Blob` returned by axios doesn't always carry the response
 *     `Content-Type`. Safari sniffs the empty type and decides to navigate
 *     instead of downloading ("Safari ne peut pas ouvrir cette page"). Always
 *     re-wrap with an explicit MIME based on the resolved filename extension.
 *   - `URL.revokeObjectURL` revoked too early cancels the in-flight download.
 *     Defer cleanup by several seconds.
 *   - Backend errors come back as Blobs when `responseType: 'blob'` — must be
 *     parsed manually or the user sees a silent 500.
 *   - Filenames with accents or slashes in `Content-Disposition` confuse
 *     Safari → run them through `safeFileName`.
 */
async function downloadFile(
  url: string,
  params: Record<string, unknown> | undefined,
  fallbackName: string,
): Promise<void> {
  exportLog('start', { url, params, fallbackName });

  let response;
  try {
    response = await api.get<Blob>(url, {
      params,
      responseType: 'blob',
      // Bigger timeout than the app default — PDF render can be slow.
      timeout: EXPORT_TIMEOUT_MS,
    });
  } catch (e: unknown) {
    const errBlob = (e as { response?: { data?: Blob } })?.response?.data;
    const msg =
      errBlob && errBlob instanceof Blob ? await readBlobMessage(errBlob) : null;
    const status = (e as { response?: { status?: number } })?.response?.status;
    exportLog('error', { url, status, msg });
    toast.error(msg || 'Échec du téléchargement de l\'export.');
    throw e;
  }

  const headers = response.headers as Record<string, string | undefined>;
  const disposition = headers['content-disposition'] ?? '';
  const serverContentType = headers['content-type'] ?? '';

  let filename = parseContentDispositionFilename(disposition) ?? fallbackName;
  filename = safeFileName(filename);

  // Re-wrap with explicit MIME so Safari recognizes the blob as a downloadable
  // file. We trust the FILENAME extension first (already sanitized), and fall
  // back to whatever the backend declared.
  const lowerName = filename.toLowerCase();
  const mime = lowerName.endsWith('.pdf')
    ? MIME.pdf
    : lowerName.endsWith('.xlsx')
      ? MIME.excel
      : serverContentType.split(';')[0]!.trim() || 'application/octet-stream';
  const blob = new Blob([response.data], { type: mime });

  exportLog('blob-ready', {
    filename,
    mime,
    blobSize: blob.size,
    serverContentType,
  });

  // Safari: anchor must be in the DOM and click() must run in the same tick
  // as the user gesture context (which the awaited axios call already broke).
  // Modern Safari (16+) is more permissive but still rejects synthetic clicks
  // on detached nodes — appendChild + click() + deferred remove() is the most
  // reliable shape across Safari / Chrome / Firefox.
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  // `target` MUST stay unset — `_blank` makes Safari open a new tab instead
  // of downloading.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Defer cleanup — Safari starts the download asynchronously and breaks
  // if the URL is revoked or the anchor removed too early. 5s is well within
  // the "download has started" window even on slow connections.
  setTimeout(() => {
    try {
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      exportLog('cleanup', { filename });
    } catch {
      /* ignore — node may already be GC'd */
    }
  }, 5000);
}

function ext(f: ExportFormat) {
  return f === 'excel' ? 'xlsx' : 'pdf';
}

/** Strip undefined / empty-string values so axios doesn't serialize them. */
function clean(obj: object | undefined): Record<string, unknown> {
  if (!obj) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '' && v !== null) out[k] = v;
  }
  return out;
}

export const exportsService = {
  products: (format: ExportFormat, filters?: ListProductsParams) =>
    downloadFile(`/exports/products/${format}`, clean(filters), `produits.${ext(format)}`),

  categories: (format: ExportFormat, filters?: ListCategoriesParams) =>
    downloadFile(`/exports/categories/${format}`, clean(filters), `categories.${ext(format)}`),

  suppliers: (format: ExportFormat, filters?: ListSuppliersParams) =>
    downloadFile(`/exports/suppliers/${format}`, clean(filters), `fournisseurs.${ext(format)}`),

  purchases: (format: ExportFormat, filters?: ListPurchasesParams) =>
    downloadFile(`/exports/purchases/${format}`, clean(filters), `achats.${ext(format)}`),

  inventoryPeriods: (format: ExportFormat, filters?: { status?: PeriodStatus }) =>
    downloadFile(
      `/exports/inventory-periods/${format}`,
      clean(filters),
      `periodes-inventaire.${ext(format)}`,
    ),

  inventoryLines: (
    periodId: string,
    format: ExportFormat,
    filters?: { search?: string; categoryId?: string; criticalOnly?: 'true' },
  ) =>
    downloadFile(
      `/exports/inventory-periods/${periodId}/lines/${format}`,
      clean(filters),
      `inventaire-${periodId.slice(0, 8)}.${ext(format)}`,
    ),

  /**
   * Blank Excel count-sheet for a given inventory period — Produit /
   * Catégorie / Cartons / Unités. The user prints this, walks the
   * fridge / shelves filling Cartons + Unités by hand, then types the
   * totals back into the Inventaire page. Backend always pulls the live
   * active-products list of the period's branch.
   *
   * Uses the same Safari-safe `downloadFile` helper as every other export
   * — no `window.open`, no anchor with `target=_blank`.
   */
  inventoryCountTemplate: (periodId: string) =>
    downloadFile(
      `/exports/inventory-periods/${periodId}/count-template/excel`,
      undefined,
      `modele-comptage-${periodId.slice(0, 8)}.xlsx`,
    ),

  accountingExpenses: (format: ExportFormat, filters?: ListAccountingExpensesParams) =>
    downloadFile(
      `/exports/accounting/expenses/${format}`,
      clean(filters),
      `depenses-comptables.${ext(format)}`,
    ),

  financialReport: (reportId: string, format: ExportFormat) =>
    downloadFile(
      `/exports/financial-reports/${reportId}/${format}`,
      undefined,
      `rapport-financier-${reportId.slice(0, 8)}.${ext(format)}`,
    ),
};
