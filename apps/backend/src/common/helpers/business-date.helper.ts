/**
 * TZ-safe helpers for business dates (purchaseDate, expenseDate, opening/closingDate,
 * labor.date, repairs.date…). These columns are Prisma `@db.Date` — they round-trip
 * as UTC midnight. To keep filter boundaries aligned with that stored value
 * regardless of the server's local TZ, build month ranges with `Date.UTC`.
 *
 * The classic bug: `new Date(2026, 5, 1)` is LOCAL midnight, so in Canada (UTC-4)
 * it lands at `2026-06-01T04:00:00Z`. A purchase stored at `2026-06-01T00:00:00Z`
 * (UTC midnight) is then strictly BEFORE that boundary and falls into May's
 * range — the J-1 shift the user reported.
 */

/** First day of a calendar month, anchored at UTC midnight. */
export function monthStartUTC(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

/** First day of the NEXT calendar month, anchored at UTC midnight. */
export function monthEndExclusiveUTC(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 1));
}

/**
 * Convert a YYYY-MM-DD string (or anything that starts with one) into a UTC-anchored
 * Date — matches how Prisma stores `@db.Date` columns, so direct equality / range
 * comparisons against persisted business dates Just Work.
 */
export function parseBusinessDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const ymd = String(value).slice(0, 10);
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return null;
  }
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Normalize a Date that may have arrived through `@Type(() => Date)` (already UTC-ish)
 * or through manual construction, so it always sits at UTC midnight.
 */
export function normalizeBusinessDate(value: Date | string | null | undefined): Date | null {
  return parseBusinessDate(value);
}
