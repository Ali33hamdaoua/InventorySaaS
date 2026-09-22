/**
 * Quebec / Canada sales tax rates.
 *
 * IMPORTANT (V2 manual-tax workflow): these rates are now used ONLY as a
 * UX convenience to pre-fill the TPS/TVQ inputs in the create form. The
 * authoritative numbers come from the user's manual entry. Backend never
 * derives TPS/TVQ from the subtotal — it just sums what was entered.
 *
 * Why: real-world Quebec invoices sometimes carry partial-tax cases (zero-
 * rated items, mixed-tax invoices, reimbursements with custom amounts).
 * Forcing 5 % / 9.975 % broke those cases. The system now trusts user input
 * and only enforces the simple invariant `total = HT + TPS + TVQ`.
 */
export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;

/** Round to 2 decimal places (cents). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TaxBreakdown {
  /** Pre-tax amount in CAD. */
  subtotal: number;
  /** Federal sales tax (manual entry, suggested 5%). */
  tps: number;
  /** Quebec sales tax (manual entry, suggested 9.975%). */
  tvq: number;
  /** subtotal + tps + tvq, rounded to 2 decimals — always derived. */
  total: number;
}

/**
 * UX helper — suggests TPS / TVQ values from a pre-tax amount using the
 * standard Quebec rates. Frontend uses this to pre-fill the inputs when the
 * user changes the HT amount. The user is free to override either value.
 *
 * NOT used by the backend for authoritative persistence — see `sumTaxes`.
 */
export function calculateTaxes(subtotal: number): TaxBreakdown {
  const safe = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const tps = round2(safe * TPS_RATE);
  const tvq = round2(safe * TVQ_RATE);
  const sub = round2(safe);
  return {
    subtotal: sub,
    tps,
    tvq,
    total: round2(sub + tps + tvq),
  };
}

/**
 * Authoritative tax sum — used by both frontend (live preview) and backend
 * (persistence). Single source of truth for the invariant:
 *
 *     total = subtotal + tps + tvq
 *
 * All inputs are coerced to non-negative finite numbers; the rest is just
 * adding 3 numbers and rounding. NO rate enforcement, NO assumption about
 * what % the user typed.
 */
export function sumTaxes(subtotal: number, tps: number, tvq: number): TaxBreakdown {
  const sub = round2(safePos(subtotal));
  const t1 = round2(safePos(tps));
  const t2 = round2(safePos(tvq));
  return { subtotal: sub, tps: t1, tvq: t2, total: round2(sub + t1 + t2) };
}

function safePos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface PurchaseLineInput {
  quantity: number;
  unitPrice: number;
}

export interface PurchaseTotals extends TaxBreakdown {
  /** Each line's computed total (qty × unitPrice, rounded to 2 decimals). */
  lineTotals: number[];
}

/**
 * Pure function — computes purchase line totals + sums with user-entered
 * TPS / TVQ. Used by:
 *   - frontend (live preview in the form)
 *   - backend (authoritative recompute before persistence)
 *
 * Lines with quantity ≤ 0 or unitPrice ≤ 0 are ignored from the subtotal
 * but their `lineTotals[i]` is still emitted (as 0) so indexing matches.
 *
 * `tps` and `tvq` come from the user (manual entry); pass 0 if not yet set.
 */
export function calculatePurchaseTotals(
  lines: PurchaseLineInput[],
  tps: number,
  tvq: number,
): PurchaseTotals {
  const lineTotals = lines.map((l) => {
    const q = Number.isFinite(l.quantity) ? l.quantity : 0;
    const p = Number.isFinite(l.unitPrice) ? l.unitPrice : 0;
    if (q <= 0 || p < 0) return 0;
    return round2(q * p);
  });
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  return { ...sumTaxes(subtotal, tps, tvq), lineTotals };
}
