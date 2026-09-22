/**
 * Client identity for generated documents (Excel workbooks, PDF reports) and
 * the Swagger title.
 *
 * Read from `process.env` at module load, so changing a variable on Render only
 * needs a restart — no rebuild. Unlike the frontend these are NOT inlined at
 * build time.
 */

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim().replace(/^["']|["']$/g, '');
  return v && v.length > 0 ? v : fallback;
}

/** Restaurant name printed on every export. */
export const BRAND_NAME = env('BRAND_NAME', 'Hong Kong Sushi');

/** Product name — the platform itself, shown next to the client name. */
export const APP_NAME = env('APP_NAME', 'Inventory SaaS');

/** Accent colour for titles, table headers and rules. `#RRGGBB`. */
export const BRAND_PRIMARY_COLOR = normalizeHex(
  env('BRAND_PRIMARY_COLOR', '#D72638'),
  '#D72638',
);

/**
 * ExcelJS wants `AARRGGBB`, not CSS hex. Kept as a derived constant so no
 * caller has to remember the alpha prefix.
 */
export const BRAND_PRIMARY_ARGB = `FF${BRAND_PRIMARY_COLOR.slice(1).toUpperCase()}`;

/**
 * Money and date formatting for exports.
 *
 * The symbol is appended manually rather than via Intl `style: 'currency'`,
 * which renders MAD as "MAD" with no way to ask for "DH". Must stay in sync
 * with CURRENCY in apps/frontend/src/lib/brand.ts.
 */
export const CURRENCY_SYMBOL = env('CURRENCY_SYMBOL', 'DH');
export const CURRENCY_CODE = env('CURRENCY_CODE', 'MAD');
export const LOCALE = env('LOCALE', 'fr-MA');

/** Byline under every export title. */
export function exportFooter(generatedOn: string): string {
  return `Généré le ${generatedOn} — ${APP_NAME} · ${BRAND_NAME}`;
}

/**
 * Guards against a malformed env value reaching ExcelJS, which would render a
 * black fill rather than fail loudly.
 */
function normalizeHex(value: string, fallback: string): string {
  let h = value.replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toUpperCase()}` : fallback;
}
