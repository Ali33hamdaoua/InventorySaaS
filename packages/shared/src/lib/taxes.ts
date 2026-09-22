/**
 * Amount totalling helpers.
 *
 * The system used to carry Quebec sales taxes (TPS 5 % / TVQ 9.975 %) on
 * purchases, accounting expenses and repairs. The client is in Morocco, where
 * those taxes do not apply, so tax handling was removed entirely rather than
 * re-parameterised: every amount in the system is now a single figure.
 *
 * The invariant is simply `total === subtotal`. These helpers are kept as the
 * shared rounding point so frontend previews and backend persistence cannot
 * drift apart on cent rounding.
 */

/** Round to 2 decimal places (centimes). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safePos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface AmountBreakdown {
  /** Pre-rounding-safe amount. */
  subtotal: number;
  /** Same as `subtotal` — kept so callers reading `.total` stay readable. */
  total: number;
}

/**
 * Authoritative amount normaliser — used by both frontend (live preview) and
 * backend (persistence), so both round identically.
 */
export function sumAmount(subtotal: number): AmountBreakdown {
  const sub = round2(safePos(subtotal));
  return { subtotal: sub, total: sub };
}

export interface PurchaseLineInput {
  quantity: number;
  unitPrice: number;
}

export interface PurchaseTotals extends AmountBreakdown {
  /** Each line's computed total (qty × unitPrice, rounded to 2 decimals). */
  lineTotals: number[];
}

/**
 * Pure function — computes purchase line totals and their sum. Used by:
 *   - frontend (live preview in the form)
 *   - backend (authoritative recompute before persistence)
 *
 * Lines with quantity ≤ 0 or a negative unitPrice are ignored from the
 * subtotal but their `lineTotals[i]` is still emitted (as 0) so indexing
 * matches the input array.
 */
export function calculatePurchaseTotals(lines: PurchaseLineInput[]): PurchaseTotals {
  const lineTotals = lines.map((l) => {
    const q = Number.isFinite(l.quantity) ? l.quantity : 0;
    const p = Number.isFinite(l.unitPrice) ? l.unitPrice : 0;
    if (q <= 0 || p < 0) return 0;
    return round2(q * p);
  });
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  return { ...sumAmount(subtotal), lineTotals };
}
