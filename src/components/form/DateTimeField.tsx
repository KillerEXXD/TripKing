import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface DateTimeFieldProps {
  /** ISO local string `YYYY-MM-DDTHH:mm` (matches native `datetime-local`). Empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Minimum allowed datetime (same format). Earlier dates are disabled in the calendar. */
  min?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, '0');

interface Parts {
  date: Date | undefined;
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
}

function parseValue(v: string): Parts {
  if (!v) {
    const now = new Date();
    const h = now.getHours();
    return {
      date: undefined,
      hour12: ((h + 11) % 12) + 1,
      minute: 0,
      meridiem: h >= 12 ? 'PM' : 'AM',
    };
  }
  const [datePart, timePart = '00:00'] = v.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const h24 = hh ?? 0;
  return {
    date,
    hour12: ((h24 + 11) % 12) + 1,
    minute: mm ?? 0,
    meridiem: h24 >= 12 ? 'PM' : 'AM',
  };
}

function toIsoLocal(parts: Parts): string {
  if (!parts.date) return '';
  const h24 =
    parts.meridiem === 'AM'
      ? parts.hour12 === 12
        ? 0
        : parts.hour12
      : parts.hour12 === 12
        ? 12
        : parts.hour12 + 12;
  const y = parts.date.getFullYear();
  const m = pad(parts.date.getMonth() + 1);
  const d = pad(parts.date.getDate());
  return `${y}-${m}-${d}T${pad(h24)}:${pad(parts.minute)}`;
}

function formatDisplay(v: string): string {
  if (!v) return '';
  const { date, hour12, minute, meridiem } = parseValue(v);
  if (!date) return '';
  // Matches `formatPickupDateTime` in lib/utils.ts — DD/MM/YYYY HH:MM AM/PM (en-IN), so the
  // form button and the post-submit detail page render the same string.
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy} ${pad(hour12)}:${pad(minute)} ${meridiem}`;
}

export function DateTimeField({
  value,
  onChange,
  id,
  min,
  disabled,
  placeholder = 'Pick date & time',
  className,
  'aria-invalid': ariaInvalid,
}: DateTimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Parts>(() => parseValue(value));

  React.useEffect(() => {
    if (open) setDraft(parseValue(value));
  }, [open, value]);

  const minDate = React.useMemo(() => {
    if (!min) return undefined;
    const { date } = parseValue(min);
    if (!date) return undefined;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [min]);

  const commit = () => {
    onChange(toIsoLocal(draft));
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  const today = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    setDraft({
      date: now,
      hour12: ((nextHour.getHours() + 11) % 12) + 1,
      minute: 0,
      meridiem: nextHour.getHours() >= 12 ? 'PM' : 'AM',
    });
  };

  const hourRef = React.useRef<HTMLDivElement>(null);
  const minuteRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
      minuteRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
    });
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-haspopup="dialog"
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-base shadow-xs',
            'transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'disabled:pointer-events-none disabled:opacity-50',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
          <CalendarIcon className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" onEscapeKeyDown={() => setOpen(false)}>
        <div className="flex flex-col">
          <div className="flex">
            <div className="border-r border-input p-2">
              <Calendar
                mode="single"
                selected={draft.date}
                onSelect={(d) => setDraft((p) => ({ ...p, date: d ?? undefined }))}
                disabled={minDate ? { before: minDate } : undefined}
                defaultMonth={draft.date}
              />
            </div>
            <div className="flex p-2">
              <div
                ref={hourRef}
                role="listbox"
                aria-label="Hour"
                className="h-64 w-12 overflow-y-auto scroll-smooth pr-1 [scrollbar-width:thin]"
              >
                {HOURS_12.map((h) => {
                  const selected = draft.hour12 === h;
                  return (
                    <button
                      type="button"
                      key={h}
                      role="option"
                      aria-selected={selected}
                      data-selected={selected}
                      onClick={() => setDraft((p) => ({ ...p, hour12: h }))}
                      className={cn(
                        'block w-full rounded-md px-2 py-1.5 text-center text-sm hover:bg-muted',
                        selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      {pad(h)}
                    </button>
                  );
                })}
              </div>
              <div
                ref={minuteRef}
                role="listbox"
                aria-label="Minute"
                className="h-64 w-12 overflow-y-auto scroll-smooth pr-1 [scrollbar-width:thin]"
              >
                {MINUTES.map((m) => {
                  const selected = draft.minute === m;
                  return (
                    <button
                      type="button"
                      key={m}
                      role="option"
                      aria-selected={selected}
                      data-selected={selected}
                      onClick={() => setDraft((p) => ({ ...p, minute: m }))}
                      className={cn(
                        'block w-full rounded-md px-2 py-1.5 text-center text-sm hover:bg-muted',
                        selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      {pad(m)}
                    </button>
                  );
                })}
              </div>
              <div role="radiogroup" aria-label="AM or PM" className="flex w-12 flex-col gap-1 pl-1">
                {(['AM', 'PM'] as const).map((mer) => {
                  const selected = draft.meridiem === mer;
                  return (
                    <button
                      type="button"
                      key={mer}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDraft((p) => ({ ...p, meridiem: mer }))}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-center text-sm hover:bg-muted',
                        selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      {mer}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-input bg-muted/30 px-3 py-2">
            <Button
              type="button"
              variant="default"
              onClick={commit}
              disabled={!draft.date}
              aria-label="Confirm date and time"
              className="w-full"
            >
              OK
            </Button>
            <div className="flex justify-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={today}>
                Today
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

DateTimeField.displayName = 'DateTimeField';
