import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  /** The accessible name of the field. */
  label: string
  placeholder?: string
  className?: string
}

/** The search field for a table's toolbar. The page owns the value and does the filtering. */
export function TableSearch({ value, onChange, label, placeholder, className }: Props) {
  return (
    <div className={cn('relative w-full max-w-xs min-w-0 flex-1 basis-60', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="h-11 pl-9" aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
