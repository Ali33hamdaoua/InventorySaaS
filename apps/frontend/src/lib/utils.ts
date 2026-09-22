import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CURRENCY } from '@/lib/brand';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Coerce a value into a finite number.
 * Handles plain numbers, numeric strings (point OR comma decimal separator),
 * and Prisma `Decimal` objects via `toString()`. Returns 0 for
 * null/undefined/NaN — never returns NaN, so tables never display "NaN $".
 */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    // Accept "1,25" → 1.25 (French decimal separator) and tolerate spaces.
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'object') {
    const obj = value as { toString?: () => string };
    if (typeof obj.toString === 'function') {
      const n = Number(obj.toString());
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/**
 * Sanitize a free-form decimal input string. Keeps digits, one comma OR one
 * dot, and a leading minus. Drops everything else. Used as an `onChange`
 * filter so the user can type "1,25" or "1.25" interchangeably and never
 * end up with garbage in state.
 *
 *   parseDecimalInput("1,25")   → "1,25"
 *   parseDecimalInput("1.25")   → "1.25"
 *   parseDecimalInput("1,2,3")  → "1,23"  (second separator stripped)
 *   parseDecimalInput("abc12")  → "12"
 */
export function parseDecimalInput(raw: string): string {
  if (raw == null) return '';
  let cleaned = String(raw).replace(/[^\d.,-]/g, '');
  // Allow a leading minus only.
  cleaned = cleaned.replace(/(?!^)-/g, '');
  // Collapse multiple separators — keep the first one only.
  let sepSeen = false;
  cleaned = cleaned.replace(/[.,]/g, (m) => {
    if (sepSeen) return '';
    sepSeen = true;
    return m;
  });
  return cleaned;
}

const currencyDigits = new Intl.NumberFormat(CURRENCY.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyDigitsCompact = new Intl.NumberFormat(CURRENCY.locale, {
  maximumFractionDigits: 0,
});

/**
 * Exposed as an object with `.format()` so the ~100 existing
 * `currency.format(x)` call sites keep working unchanged. The symbol is
 * appended by hand — see the note on CURRENCY in lib/brand.ts.
 */
export const currency = {
  format: (n: number) => `${currencyDigits.format(n)} ${CURRENCY.symbol}`,
};

export const currencyCompact = {
  format: (n: number) => `${currencyDigitsCompact.format(n)} ${CURRENCY.symbol}`,
};

export const formatNumber = (n: number, digits = 2) =>
  new Intl.NumberFormat(CURRENCY.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

export const formatPercent = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : `${formatNumber(n, digits)} %`;

export const formatDeltaPct = (n: number | null | undefined, digits = 1) => {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatNumber(n, digits)} %`;
};

export const formatDeltaPp = (n: number | null | undefined, digits = 1) => {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatNumber(n, digits)} pp`;
};

export const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

/* ============================================================
   Business date helpers — TIMEZONE-SAFE.

   A "business date" is a calendar date the USER picked or a calendar
   date stored in a `@db.Date` column on the backend. It must round-trip
   identically regardless of the user's timezone.

   The classic bug we work around: `new Date("2026-06-02")` is parsed as
   UTC midnight (per ISO 8601 short-form rules). When formatted with
   `Intl.DateTimeFormat` in the user's local TZ (e.g. UTC-4 Canada), it
   reads "01 juin 2026" — a full day shifted. Symmetrically, formatting
   via `.toISOString()` after constructing with local components shifts
   the day in the OTHER direction.

   These helpers parse the YYYY-MM-DD string by HAND and never round-trip
   through UTC, so the date the user picked stays the date the user sees.
   ============================================================ */

/**
 * Parse a business-date string ("YYYY-MM-DD" or "YYYY-MM-DDT…") into a
 * Date object anchored at LOCAL midnight. Use this for display formatting
 * — NEVER for sending back to the API (use `dateInputValue` instead).
 *
 * Returns null if the input is empty or unparseable.
 */
export function parseBusinessDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ymd = String(value).slice(0, 10);
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
}

const DEFAULT_BUSINESS_DATE_FMT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

/**
 * Format a business-date string for display.
 *
 *   formatBusinessDate("2026-06-02")  → "02 juin 2026"   (everywhere, any TZ)
 *
 * Replaces every `new Intl.DateTimeFormat(...).format(new Date(stored))`
 * pattern in the app — that pattern is what was off-by-one in Canada.
 */
export function formatBusinessDate(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale: string = CURRENCY.locale,
): string {
  if (!value) return '—';
  const dt = parseBusinessDate(value);
  if (!dt) return String(value);
  return new Intl.DateTimeFormat(locale, options ?? DEFAULT_BUSINESS_DATE_FMT).format(dt);
}

/**
 * Returns a YYYY-MM-DD string suitable for `<input type="date">` value
 * or for sending to the backend as a business date. Accepts:
 *
 *  - A YYYY-MM-DD string from the API (kept as-is)
 *  - A YYYY-MM-DDT… ISO string (truncated to first 10 chars)
 *  - A Date object (decomposed via local components, NOT toISOString)
 *  - null / undefined → ""
 *
 * NEVER use `date.toISOString().slice(0, 10)` on a user-picked date — that
 * shifts the day in some timezones. This helper avoids the trap.
 */
export function dateInputValue(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  // Date object → use LOCAL year/month/day, NOT UTC, so a date picked at
  // local midnight stays on that same day for the user.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayInputValue(): string {
  return dateInputValue(new Date());
}

/**
 * Given a calendar month (`year`, `month` where month is 1-12), returns
 * the inclusive `YYYY-MM-DD` bounds of that month. Used by the pages that
 * expose a Mois/Année picker (Purchases, Accounting…) to derive the
 * `startDate` / `endDate` query params.
 *
 * We compute the last day via `new Date(year, month, 0)` — passing day=0
 * to the local Date constructor rolls back to the last day of the previous
 * month, i.e. exactly the last day of the target month when you feed it
 * the month index one HIGHER. `new Date(Date.UTC(y, m, 0))` avoids TZ
 * drift on the day-count itself.
 *
 *   monthToDateRange(2026, 6) → { startDate: '2026-06-01', endDate: '2026-06-30' }
 */
export function monthToDateRange(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  const mm = String(month).padStart(2, '0');
  // Passing day = 0 to Date.UTC(y, monthIndex) rolls to the last day of
  // (monthIndex - 1). We want the last day of `month` (1-12), so we pass
  // `month` as-is (JS month index = `month` - 1, so day=0 lands on the
  // last day of month `month-1` in 0-indexed terms, which IS `month` in
  // 1-indexed terms). Verified with June: Date.UTC(2026, 6, 0) → 30 juin.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dd = String(lastDay).padStart(2, '0');
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${dd}`,
  };
}
