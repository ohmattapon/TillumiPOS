import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  /** `dot` is a colour drawn as a small mark before the label, such as a category's colour. */
  options: { value: T; label: string; count?: number; dot?: string }[]
  /** Taller triggers for touch screens. */
  size?: 'default' | 'touch'
  className?: string
}

/** Filter switcher whose active option is filled with the accent colour. */
export function SegmentedTabs<T extends string>({ value, onChange, options, size = 'default', className }: Props<T>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className={className}>
      <TabsList className={cn('border bg-muted/60', size === 'touch' && 'h-13!')}>
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className={cn(
              'px-3 data-[state=active]:bg-primary! data-[state=active]:text-primary-foreground!',
              // The list has 3px of padding, so the trigger is set to 44px itself.
              size === 'touch' && 'h-11! px-4 text-base',
            )}
          >
            {option.dot && (
              <span aria-hidden className="size-2.5 shrink-0 rounded-full ring-2 ring-background/70" style={{ backgroundColor: option.dot }} />
            )}
            {option.label}
            {option.count !== undefined && <span className="tabular-nums opacity-70">{option.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
