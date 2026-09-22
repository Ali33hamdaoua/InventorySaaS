import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

interface Props {
  className?: string;
  /** Pixel size of the logo's longest side. Defaults to 32. */
  size?: number;
  /** Inline styles — used for brand-coloured glows that depend on the palette. */
  style?: React.CSSProperties;
}

/**
 * The client's logo, path and alt text both taken from `BRAND`. Use this
 * component everywhere instead of hard-coding `<img src="/logo.png">` so
 * re-skinning for another client stays a config change.
 */
export function Logo({ className, size = 32, style }: Props) {
  return (
    <img
      src={BRAND.logo}
      alt={BRAND.name}
      width={size}
      height={size}
      className={cn('select-none object-contain', className)}
      style={style}
      draggable={false}
    />
  );
}
