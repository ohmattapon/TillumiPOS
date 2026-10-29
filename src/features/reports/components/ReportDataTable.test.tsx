import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import { reportsLocales } from '@/features/reports/locales'
import { ReportDataTable } from './ReportDataTable'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th, reports: reportsLocales.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const headers = ['วัน', 'บิล', 'ยอดขาย', 'กำไร']
const rows = [['1 ต.ค.', 3, '฿300', '฿50']]

describe('ReportDataTable (adapter บน DataTable กลาง)', () => {
  test('แสดง headers และ cells ครบ', () => {
    const html = renderToStaticMarkup(<ReportDataTable headers={headers} rows={rows} />)
    for (const text of [...headers, '1 ต.ค.', '฿300']) expect(html).toContain(text)
  })

  test('มี phone list variant ของ DataTable กลาง (ul)', () => {
    const html = renderToStaticMarkup(<ReportDataTable headers={headers} rows={rows} />)
    expect(html).toContain('<ul')
  })

  test('คอลัมน์ตัวเลขชิดขวาตั้งแต่ numberFrom', () => {
    const html = renderToStaticMarkup(<ReportDataTable headers={headers} rows={rows} numberFrom={2} />)
    expect(html).toContain('text-right')
  })

  test('ไม่มีแถวแสดงข้อความว่างของ reports', () => {
    const html = renderToStaticMarkup(<ReportDataTable headers={headers} rows={[]} />)
    expect(html).toContain(reportsLocales.th.empty)
  })
})

describe('ReportDataTable footer', () => {
  test('แสดงแถวรวมต่อท้ายตัวหนา', () => {
    const html = renderToStaticMarkup(<ReportDataTable headers={headers} rows={rows} footer={['รวม', 9, '฿900', '฿150']} />)
    for (const text of ['รวม', '฿900', '฿150']) expect(html).toContain(text)
    expect(html).toContain('font-semibold')
  })
})
