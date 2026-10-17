import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { enUS, th } from 'react-day-picker/locale'
import { fromCalendarDate, toCalendarDate } from '@/lib/calendar-date'
import type { DateFormat } from '@/lib/money'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface Props {
  id: string
  label: string
  value: string
  today: string
  locale: 'th' | 'en'
  dateFormat: Pick<DateFormat, 'calendarDate' | 'calendarYear'>
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}

/** shadcn Calendar + Popover, keeping date-only filters independent of UTC conversion. */
export function DatePicker({ id, label, value, today, locale, dateFormat, invalid, describedBy, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = fromCalendarDate(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="h-11 w-full justify-between" aria-label={label}
          aria-invalid={invalid} aria-describedby={[`${id}-value`, describedBy].filter(Boolean).join(' ')}>
          <span id={`${id}-value`}>{selected ? dateFormat.calendarDate(value) : t('datePicker.placeholder')}</span>
          <CalendarDays data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label} collisionPadding={12}
        className="max-h-(--radix-popover-content-available-height) w-auto max-w-[calc(100vw-1.5rem)] overflow-y-auto p-0">
        <Calendar mode="single" required selected={selected} autoFocus
          defaultMonth={selected ?? fromCalendarDate(today)} today={fromCalendarDate(today)}
          captionLayout="dropdown" locale={locale === 'th' ? th : enUS}
          startMonth={fromCalendarDate(`${String(Math.min(1900, selected?.getFullYear() ?? 1900)).padStart(4, '0')}-01-01`)}
          endMonth={fromCalendarDate(`${Math.max(2100, selected?.getFullYear() ?? 2100)}-12-31`)}
          className="[--cell-size:2.75rem]"
          classNames={{ dropdown_root: 'relative flex h-11 items-center rounded-md' }}
          formatters={{ formatYearDropdown: (date) => dateFormat.calendarYear(toCalendarDate(date)) }}
          labels={{
            labelPrevious: () => t('datePicker.previousMonth'),
            labelNext: () => t('datePicker.nextMonth'),
            labelMonthDropdown: () => t('datePicker.month'),
            labelYearDropdown: () => t('datePicker.year'),
            labelNav: () => t('datePicker.navigation'),
            labelGrid: (date) => dateFormat.calendarDate(toCalendarDate(date)),
            labelDayButton: (date, modifiers) => [
              dateFormat.calendarDate(toCalendarDate(date)),
              modifiers.today && t('datePicker.today'),
              modifiers.selected && t('datePicker.selected'),
            ].filter(Boolean).join(', '),
          }}
          onSelect={(date) => {
            onChange(toCalendarDate(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
