import { DayPicker, type DayPickerProps } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('rdp-tripking', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-2',
        caption_label: 'text-sm font-medium',
        nav: 'flex gap-1',
        button_previous: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
        button_next: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
        weekdays: 'grid grid-cols-7',
        weekday: 'w-8 text-center text-xs text-muted-foreground font-normal',
        week: 'grid grid-cols-7',
        day: 'size-8 p-0 text-center text-sm',
        day_button:
          'inline-flex size-8 items-center justify-center rounded-full hover:bg-muted aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary/90 aria-selected:font-semibold',
        // Today gets a soft emerald tint on the button + bold primary text. When also
        // `aria-selected`, the day_button's `bg-primary` + `text-primary-foreground`
        // override cleanly — both rules layer without hiding the day number.
        today: 'font-bold text-primary [&_button]:bg-primary/10',
        outside: 'text-muted-foreground/40',
        disabled: 'text-muted-foreground/40 pointer-events-none',
        ...classNames,
      }}
      {...props}
    />
  );
}

export { Calendar };
