import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import { DataTable } from './DataTable'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const columns = [
  { id: 'name', header: 'ชื่อ', priority: 'primary', cell: (row: { name: string }) => row.name },
] as const

describe('DataTable (compact admin rows)', () => {
  test('rows are compact (~40px) with hover', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns.map((c) => ({ ...c }))}
        rows={[{ name: 'กาแฟ' }]}
        rowKey={(row) => row.name}
        empty="ไม่มีข้อมูล"
      />,
    )
    expect(html).toContain('px-3')
    expect(html).toContain('hover:bg-muted/50')
  })
})
