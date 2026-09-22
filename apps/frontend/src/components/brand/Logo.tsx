import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Pixel size of the logo's longest side. Defaults to 32. */
  size?: number;
}

/**
 * « La Maison du Burger » logo — served as a static asset from
 * `apps/frontend/public/logo.png`. Use this component everywhere instead
 * of hard-coding `<img src="/logo.png">` so a future asset change only
 * needs to be made in one place.
 */
export function Logo({ className, size = 32 }: Props) {
  return (
    <img
      src="/logo.png"
      alt="La Maison du Burger"
      width={size}
      height={size}
      className={cn('select-none object-contain', className)}
      draggable={false}
    />
  );
}
