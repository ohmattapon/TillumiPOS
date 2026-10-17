import { useMemo } from 'react'
import { createDateFormat, createMoney } from '@/lib/money'
import { useSettings } from './use-settings'

/** Money and dates formatted for the shop's currency and language. */
export function useFormat() {
  const { currency, locale } = useSettings()

  return useMemo(
    () => ({ money: createMoney(currency, locale), date: createDateFormat(locale), currency, locale }),
    [currency, locale],
  )
}
