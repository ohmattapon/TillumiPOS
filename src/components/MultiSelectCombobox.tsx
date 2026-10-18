import { Check, ChevronsUpDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { filterItems, nextActiveIndex, type ListKey, type SearchableItem } from '@/lib/combobox'
import { cn } from '@/lib/utils'

export interface ComboboxItem extends SearchableItem {
  id: number
  /** A picture or icon before the label. */
  leading?: ReactNode
  /** A badge after the label. */
  trailing?: ReactNode
}

interface Props {
  /** What the button says while the list is closed. */
  label: string
  searchLabel: string
  emptyText: string
  items: readonly ComboboxItem[]
  selectedIds: readonly number[]
  onToggle: (id: number) => void
  /**
   * Set when the items are already the answer to the typed text (a search done elsewhere): they are shown as they
   * are, and this hears every keystroke. Without it the items are all there is, and are filtered here.
   */
  onSearchChange?: (query: string) => void
  /** A line under the list: loading, an error, or how many more there are. */
  status?: ReactNode
  id?: string
  className?: string
}

const LIST_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End']

/** A button that opens a searchable list where several rows can be ticked; the list stays open between ticks. */
export function MultiSelectCombobox({
  label, searchLabel, emptyText, items, selectedIds, onToggle, onSearchChange, status, id, className,
}: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const activeRef = useRef<HTMLLIElement | null>(null)

  const shown = onSearchChange ? [...items] : filterItems(items, query)
  const optionId = (item: ComboboxItem) => `${listId}-${item.id}`
  // Kept inside the list, so Enter never ticks a row that a new search has taken away.
  const current = shown.length === 0 ? -1 : Math.min(Math.max(active, 0), shown.length - 1)
  const activeItem = shown[current]

  useEffect(() => activeRef.current?.scrollIntoView?.({ block: 'nearest' }), [current])

  const search = (value: string) => {
    setQuery(value)
    setActive(0)
    onSearchChange?.(value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (LIST_KEYS.includes(event.key)) {
      event.preventDefault()
      setActive(nextActiveIndex(current, shown.length, event.key as ListKey))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeItem) onToggle(activeItem.id)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) search('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          // A combobox does not take its name from its text, so the visible text is named explicitly.
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          className={cn('h-10 w-full justify-between font-normal', className)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 gap-2 p-2">
        <Input
          type="search"
          className="h-10"
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
          aria-autocomplete="list"
          onChange={(event) => search(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-multiselectable aria-label={label} className="max-h-64 overflow-y-auto">
          {shown.map((item, index) => {
            const selected = selectedIds.includes(item.id)
            return (
              <li
                key={item.id}
                id={optionId(item)}
                ref={index === current ? activeRef : undefined}
                role="option"
                aria-selected={selected}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm',
                  index === current ? 'bg-muted' : 'hover:bg-muted/60',
                )}
                // The input keeps the focus, so a click ticks the row without taking it away.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onToggle(item.id)}
                onMouseMove={() => setActive(index)}
              >
                {item.leading}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}
                </span>
                {item.trailing}
                <Check className={cn('size-4 shrink-0 text-primary', !selected && 'invisible')} aria-hidden />
              </li>
            )
          })}
        </ul>
        {shown.length === 0 && !status && <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</p>}
        {status && <div className="px-2 py-1 text-xs text-muted-foreground">{status}</div>}
      </PopoverContent>
    </Popover>
  )
}
