/**
 * Single source of truth for the client's identity: name, logo, and palette.
 *
 * Everything here is driven by `VITE_*` env vars so the same codebase can be
 * re-skinned for another restaurant without touching a component. The defaults
 * describe the current client, which means a build with no env vars set still
 * renders correctly rather than showing placeholders.
 *
 * Vite inlines `import.meta.env` at BUILD time. Changing a variable on Vercel
 * therefore requires a redeploy — it is not read at runtime.
 */

/** Strips quotes that survive when a value is pasted into a dashboard field. */
function env(value: string | undefined, fallback: string): string {
  const v = value?.trim().replace(/^["']|["']$/g, '');
  return v && v.length > 0 ? v : fallback;
}

export const BRAND = {
  name: env(import.meta.env.VITE_BRAND_NAME, 'Hong Kong Sushi'),
  subtitle: env(import.meta.env.VITE_BRAND_SUBTITLE, 'Inventaire & food cost — Agadir'),
  logo: env(import.meta.env.VITE_BRAND_LOGO, '/logo.png'),
  theme: env(import.meta.env.VITE_BRAND_THEME, 'dark') === 'light' ? 'light' : 'dark',
} as const;

/** Raw hex values. Charts (Recharts) need real colours, not CSS variables. */
export const BRAND_COLORS = {
  primary: env(import.meta.env.VITE_COLOR_PRIMARY, '#D72638'),
  bg: env(import.meta.env.VITE_COLOR_BG, '#0F0F10'),
  card: env(import.meta.env.VITE_COLOR_CARD, '#1A1A1D'),
  text: env(import.meta.env.VITE_COLOR_TEXT, '#F5F1EA'),
  textMuted: env(import.meta.env.VITE_COLOR_TEXT_MUTED, '#9A948C'),
  border: env(import.meta.env.VITE_COLOR_BORDER, '#2A2A2E'),
} as const;

/**
 * Money and date formatting.
 *
 * The symbol is applied manually rather than through `Intl` `style: 'currency'`
 * because that renders MAD as "MAD" with no way to ask for "DH". Keeping the
 * symbol as its own variable lets the client pick either.
 */
export const CURRENCY = {
  symbol: env(import.meta.env.VITE_CURRENCY_SYMBOL, 'DH'),
  code: env(import.meta.env.VITE_CURRENCY_CODE, 'MAD'),
  locale: env(import.meta.env.VITE_LOCALE, 'fr-MA'),
} as const;

/**
 * Categorical palette for donuts and stacked bars. The brand colour leads so
 * the largest slice matches the rest of the UI; the remaining hues are
 * brand-neutral and stay distinguishable on a dark background.
 */
export const CHART_PALETTE = [
  BRAND_COLORS.primary,
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
] as const;

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Tailwind consumes these as `hsl(var(--primary))`, so the variable must hold
 * a bare `H S% L%` triplet. Writing a hex value straight into the variable
 * silently breaks every themed class — hence this conversion.
 */
function toHslTriplet(hex: string, fallback: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return fallback;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(h * 360)} ${round(s * 100)}% ${round(l * 100)}%`;
}

/** WCAG relative luminance — decides whether text on a fill is light or dark. */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Readable text colour for a filled surface (buttons, table headers). */
export function contrastOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#0A0A0A' : '#FFFFFF';
}

/** Blends `hex` toward white (positive ratio) or black (negative). */
function shift(hex: string, ratio: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = ratio >= 0 ? 255 : 0;
  const amount = Math.abs(ratio);
  const mix = (c: number) => Math.round(c + (target - c) * amount);
  const hx = (c: number) => mix(c).toString(16).padStart(2, '0');
  return `#${hx(rgb.r)}${hx(rgb.g)}${hx(rgb.b)}`;
}

/* ------------------------------------------------------------------ */
/* Theme application                                                   */
/* ------------------------------------------------------------------ */

/**
 * Writes the palette into the shadcn/ui CSS variables on `<html>`, and syncs
 * the document title, favicon and `theme-color`.
 *
 * Called from `main.tsx` before React mounts. `index.css` still ships the same
 * palette as literal defaults, so there is no flash of the wrong colours while
 * the bundle loads — this function only matters when env vars override them.
 */
export function applyBrandTheme(): void {
  const root = document.documentElement;
  const c = BRAND_COLORS;

  const isLight = BRAND.theme === 'light';
  // On a dark theme the "raised" surfaces sit above the page background; on a
  // light one they sit below it. Nudging in the right direction keeps popovers
  // and inputs distinguishable from cards without asking for six more vars.
  const raise = (hex: string, amount: number) => shift(hex, isLight ? -amount : amount);

  const set = (name: string, hex: string, fallback = '0 0% 50%') => {
    root.style.setProperty(`--${name}`, toHslTriplet(hex, fallback));
  };

  set('background', c.bg);
  set('foreground', c.text);

  set('card', c.card);
  set('card-foreground', c.text);

  set('popover', raise(c.card, 0.04));
  set('popover-foreground', c.text);

  set('primary', c.primary);
  set('primary-foreground', contrastOn(c.primary));

  set('secondary', raise(c.card, 0.06));
  set('secondary-foreground', c.text);

  set('muted', raise(c.card, 0.06));
  set('muted-foreground', c.textMuted);

  set('accent', c.primary);
  set('accent-foreground', contrastOn(c.primary));

  set('border', c.border);
  set('input', raise(c.card, 0.06));
  set('ring', c.primary);

  set('chart-1', CHART_PALETTE[0]);
  set('chart-2', CHART_PALETTE[1]);
  set('chart-3', CHART_PALETTE[2]);
  set('chart-4', CHART_PALETTE[3]);
  set('chart-5', CHART_PALETTE[4]);

  root.classList.toggle('dark', !isLight);
  root.style.colorScheme = isLight ? 'light' : 'dark';

  document.title = `${BRAND.name} — Inventaire`;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = c.primary;

  for (const rel of ['icon', 'apple-touch-icon']) {
    const link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (link) link.href = BRAND.logo;
  }
}

/**
 * `rgba()` string built from the brand colour — for the decorative glows on the
 * login page, which need real colour values rather than a themed class.
 */
export function primaryAlpha(alpha: number): string {
  const rgb = parseHex(BRAND_COLORS.primary) ?? { r: 215, g: 38, b: 56 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
