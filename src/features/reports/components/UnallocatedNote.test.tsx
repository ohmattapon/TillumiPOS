import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import { reportsLocales } from '@/features/reports/locales'
import { createCountFormat } from '@/lib/money'
import { UnallocatedNote } from './UnallocatedNote'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th, reports: reportsLocales.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const render = (lines: number) => renderToStaticMarkup(<UnallocatedNote lines={lines} format={createCountFormat('th')} />)

describe('UnallocatedNote', () => {
  test('shows nothing when every line has its share', () => {
    expect(render(0)).toBe('')
  })

  test('is a status note with the grouped count when lines are missing', () => {
    const html = render(1250)
    expect(html).toContain('role="status"')
    expect(html).toContain('1,250')
  })
})
