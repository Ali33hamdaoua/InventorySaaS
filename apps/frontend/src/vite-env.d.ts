/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;

  /* Branding — see src/lib/brand.ts. All optional: the defaults in that
     module describe the current client, so a missing env var degrades to a
     correct-looking build instead of a blank UI. */
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_SUBTITLE?: string;
  readonly VITE_BRAND_LOGO?: string;
  readonly VITE_BRAND_THEME?: string;

  readonly VITE_COLOR_PRIMARY?: string;
  readonly VITE_COLOR_BG?: string;
  readonly VITE_COLOR_CARD?: string;
  readonly VITE_COLOR_TEXT?: string;
  readonly VITE_COLOR_TEXT_MUTED?: string;
  readonly VITE_COLOR_BORDER?: string;

  readonly VITE_CURRENCY_SYMBOL?: string;
  readonly VITE_CURRENCY_CODE?: string;
  readonly VITE_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
