import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Free-form combobox — looks like a `Select` trigger, behaves like an `Input`
 * with autocomplete. Drop-in replacement for the native `<datalist>` we used
 * for the accounting category field: same dark Maison Burger styling as the
 * shadcn Select, but accepts brand-new values too.
 *
 * Why a custom component instead of pulling in Radix Popover + cmdk: we only
 * needed this one combobox in the whole app (the category picker) and adding
 * two new dependencies for it was overkill. The implementation is ~150 lines
 * of plain React, fully a11y-friendly (arrow nav, Enter to commit, Esc to
 * close, click-outside), and matches the visual language of the existing
 * SelectTrigger 1-to-1.
 */
export interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** All known suggestions. The user can pick one, OR type something new. */
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  /** Footer hint shown when nothing matches the current input — perfect for
   *  telling the user "this name will be created on save". */
  emptyHint?: string;
  className?: string;
  'aria-label'?: string;
}

export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  emptyHint,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Filter case-insensitively against the current input. When the input is
  // empty we show the full list — opening the dropdown should reveal every
  // known category, not nothing.
  const filtered = React.useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((opt) => opt.toLowerCase().includes(needle));
  }, [options, value]);

  const hasExactMatch = React.useMemo(
    () => options.some((o) => o.toLowerCase() === value.trim().toLowerCase()),
    [options, value],
  );

  // Click-outside closes the dropdown without committing — the input value
  // stays as the user typed it (free-form).
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Scroll the focused option into view as the user arrows through.
  React.useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelectorAll('[role="option"]')[activeIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length > 0 ? 0 : -1);
      } else {
        setActiveIndex((i) => (filtered.length === 0 ? -1 : (i + 1) % filtered.length));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length - 1);
      } else {
        setActiveIndex((i) =>
          filtered.length === 0 ? -1 : (i - 1 + filtered.length) % filtered.length,
        );
      }
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]!);
      }
      // No active highlight → let the form submit naturally (don't preventDefault).
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div
        className={cn(
          // Mirror SelectTrigger styles 1-to-1 so the field is visually
          // indistinguishable from the other dropdowns in the form.
          'flex h-10 w-full items-center rounded-md border border-input bg-background pl-3 pr-2 py-2 text-sm text-foreground ring-offset-background',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-listbox` : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed',
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Fermer la liste' : 'Ouvrir la liste'}
          disabled={disabled}
          onMouseDown={(e) => {
            // mousedown (not click) so we win the race against the input's
            // blur, which would otherwise close the popover before we can
            // toggle it.
            e.preventDefault();
            if (disabled) return;
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground transition-transform"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className={cn(
            // Match SelectContent: same border, popover bg, big drop-shadow.
            'absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-auto rounded-md border border-border/60 bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popover)]',
          )}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">
              {value.trim()
                ? (emptyHint ?? 'Aucune correspondance.')
                : 'Aucune catégorie enregistrée.'}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const isActive = i === activeIndex;
              const isSelected = opt.toLowerCase() === value.trim().toLowerCase();
              return (
                <li
                  key={opt}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    // Same trick as the chevron — beat the input blur.
                    e.preventDefault();
                    commit(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm transition-colors',
                    isActive && 'bg-primary/10 text-foreground',
                    isSelected && !isActive && 'text-primary',
                  )}
                >
                  {isSelected && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4 text-primary" />
                    </span>
                  )}
                  {opt}
                </li>
              );
            })
          )}

          {/* Footer hint when the user is in "create new" territory: input is
              non-empty, no exact match exists, and there ARE existing options
              (otherwise the empty-state above already says it all). */}
          {value.trim() && !hasExactMatch && filtered.length > 0 && emptyHint && (
            <li className="mt-1 border-t border-border/60 px-3 py-2 text-[11px] italic text-muted-foreground">
              {emptyHint}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
