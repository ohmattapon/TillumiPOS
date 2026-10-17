import { Delete } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { appendDigit, canSubmitPin, removeDigit } from '../lib/pin-input'

interface Props {
  pin: string
  onChange: (pin: string) => void
  onSubmit: () => void
  disabled?: boolean
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Digit buttons for a touch screen; the same digits, Backspace and Enter also work from a keyboard. */
export function PinPad({ pin, onChange, onSubmit, disabled = false }: Props) {
  const { t } = useTranslation('auth')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled) return
      if (/^\d$/.test(event.key)) onChange(appendDigit(pin, event.key))
      else if (event.key === 'Backspace') onChange(removeDigit(pin))
      else if (event.key === 'Enter' && canSubmitPin(pin)) {
        // Enter on a focused button (Cancel, use password, or the pad's own submit) is that button's click.
        if (event.target instanceof Element && event.target.closest('button, a')) return
        event.preventDefault()
        onSubmit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, disabled, onChange, onSubmit])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-11 items-center justify-center gap-2" aria-hidden="true">
        {Array.from({ length: Math.max(pin.length, 4) }, (_, index) => (
          <span key={index} className={`size-3 rounded-full border ${index < pin.length ? 'bg-foreground' : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((digit) => (
          <Button key={digit} type="button" variant="outline" className="h-14 text-xl tabular-nums" disabled={disabled} onClick={() => onChange(appendDigit(pin, digit))}>
            {digit}
          </Button>
        ))}
        <Button type="button" variant="outline" className="h-14" aria-label={t('pin.backspace')} disabled={disabled || pin === ''} onClick={() => onChange(removeDigit(pin))}>
          <Delete />
        </Button>
        <Button type="button" variant="outline" className="h-14 text-xl tabular-nums" disabled={disabled} onClick={() => onChange(appendDigit(pin, '0'))}>
          0
        </Button>
        <Button type="button" className="h-14" disabled={disabled || !canSubmitPin(pin)} onClick={onSubmit}>
          {t('pin.submit')}
        </Button>
      </div>
    </div>
  )
}
