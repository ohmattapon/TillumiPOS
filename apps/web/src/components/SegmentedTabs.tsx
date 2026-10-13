import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  /** Taller triggers for touch screens. */
  size?: 'default' | 'touch'
  className?: string
}

/** Filter switcher whose active option is filled with the accent colour. */
export function SegmentedTabs<T extends string>({ value, onChange, options, size = 'default', className }: Props<T>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className={className}>
      <TabsList className={cn('border bg-muted/60', size === 'touch' && 'h-11!')}>
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className={cn(
              'px-3 data-[state=active]:bg-primary! data-[state=active]:text-primary-foreground!',
              size === 'touch' && 'px-4 text-base',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="tabular-nums opacity-70">{option.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
