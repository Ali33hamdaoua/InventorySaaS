import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

interface IconInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode;
  /** Side the icon sits on. Defaults to left. */
  iconPosition?: 'left' | 'right';
}

/**
 * Standardised filter input with an inline icon (search, calendar, etc).
 * Used across all *Filters components so date pickers and search boxes
 * share the same visual language.
 */
export const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  ({ icon, iconPosition = 'left', className, ...props }, ref) => {
    return (
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground',
            iconPosition === 'left' ? 'left-3' : 'right-3',
          )}
        >
          {icon}
        </span>
        <Input
          ref={ref}
          className={cn(
            iconPosition === 'left' ? 'pl-9' : 'pr-9',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
IconInput.displayName = 'IconInput';
