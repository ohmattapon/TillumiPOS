import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import { reportsLocales } from '@/features/reports/locales'
import { PaginationBar } from '@/components/PaginationBar'
import * as ReportDataTableModule from './ReportDataTable'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th, reports: reportsLocales.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const noop = () => {}
/** Adapter บางๆ ที่ ReportsPage ใช้: offset (step 10) <-> page ของ PaginationBar */
const reportPage = (offset: number) => Math.floor(offset / 10)
const reportOffset = (page: number) => page * 10

describe('ReportsPage pagination (PaginationBar ตัวเดียว)', () => {
  test('ไม่มี ReportPagination ให้ import แล้ว', () => {
    expect('ReportPagination' in ReportDataTableModule).toBe(false)
  })

  test('products offset 20 / total 95 -> Bar หน้า 3 (0-based 2) ช่วง 21–30', () => {
    const html = renderToStaticMarkup(
      <PaginationBar page={reportPage(20)} pageSize={10} total={95} onPageChange={noop} />,
    )
    expect(html).toContain('21–30 จาก 95 รายการ')
    expect(html).toContain('aria-label="ไปหน้าที่ 3"')
    expect(html).toContain('aria-current="page"')
  })

  test('กดเลขหน้า map กลับเป็น offset ถูก (หน้า 5 -> offset 50)', () => {
    expect(reportOffset(5)).toBe(50)
  })

  test('total 0 ซ่อนเหมือนเดิม', () => {
    expect(renderToStaticMarkup(
      <PaginationBar page={reportPage(0)} pageSize={10} total={0} onPageChange={noop} />,
    )).toBe('')
  })
})
