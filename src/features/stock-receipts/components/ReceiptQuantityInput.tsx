import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { receiptQuantity } from '../lib/quantity'

interface Props {
  quantity: number
  label: string
  disabled: boolean
  onQuantity: (quantity: number) => void
  onInvalid: (invalid: boolean) => void
}

export function ReceiptQuantityInput({ quantity, label, disabled, onQuantity, onInvalid }: Props) {
  const [text, setText] = useState(String(quantity))
  const [previous, setPrevious] = useState(quantity)
  if (previous !== quantity) { setPrevious(quantity); setText(String(quantity)) }
  const invalid = receiptQuantity(text) === null
  return <Input type="number" min={1} max={2147483647} step={1} className="h-11 w-28 tabular-nums"
    aria-label={label} aria-invalid={invalid || undefined} value={text} disabled={disabled}
    onChange={(event) => {
      const next = event.target.value
      setText(next)
      const parsed = receiptQuantity(next)
      onInvalid(parsed === null)
      if (parsed !== null) onQuantity(parsed)
    }}
    onBlur={() => {
      // Leaving an unfinished field restores the last durably saved quantity.
      setText(String(quantity)); onInvalid(false)
    }} />
}
