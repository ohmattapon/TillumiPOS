import { Delete } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { appendDigit, canSubmitPin, pinKeyAction, removeDigit } from '../lib/pin-input'

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

  const padRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled) return
      const target = event.target instanceof Element ? event.target : null
      const action = pinKeyAction({
        key: event.key,
        pin,
        targetIsInsidePad: Boolean(target && padRef.current?.contains(target)),
        targetIsButtonOrLink: Boolean(target?.closest('button, a')),
        targetIsSubmit: Boolean(target?.closest('[data-pin-submit]')),
      })
      if (action === 'ignore') return
      event.preventDefault()
      if (action === 'digit') onChange(appendDigit(pin, event.key))
      else if (action === 'backspace') onChange(removeDigit(pin))
      else if (action === 'submit') onSubmit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, disabled, onChange, onSubmit])

  return (
    <div ref={padRef} className="flex flex-col gap-3">
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
        <Button type="button" data-pin-submit className="h-14" disabled={disabled || !canSubmitPin(pin)} onClick={onSubmit}>
          {t('pin.submit')}
        </Button>
      </div>
    </div>
  )
}
