import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import { PaginationBar } from './PaginationBar'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const noop = () => {}

function renderBar(page: number, pageSize: number, total?: number) {
  return renderToStaticMarkup(
    <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={noop} />,
  )
}

describe('PaginationBar (minimal)', () => {
  test('total 467 / 24 ต่อหน้า / หน้าแรก: โชว์ช่วงเดิม + ปุ่มเลข [1,2,3,…,20]', () => {
    const html = renderBar(0, 24, 467)
    expect(html).toContain('1–24 จาก 467 รายการ')
    expect(html).toContain('aria-label="ไปหน้าที่ 3"')
    expect(html).toContain('aria-label="ไปหน้าที่ 20"')
    expect(html).toContain('hidden items-center gap-1 sm:flex')
  })

  test('ปุ่มเลขหน้ามี aria-current ตรงหน้าที่เลือก', () => {
    const html = renderBar(5, 24, 467)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>6<')
    expect(html).toContain('aria-label="ไปหน้าที่ 5"')
    expect(html).toContain('aria-label="ไปหน้าที่ 7"')
  })

  test('มีชุดย่อสำหรับมือถือ ‹ 6/20 ›', () => {
    const html = renderBar(5, 24, 467)
    expect(html).toContain('sm:hidden')
    expect(html).toContain('6 / 20')
  })

  test('หน้าเดียวซ่อนเหมือนเดิม', () => {
    expect(renderBar(0, 24, 10)).toBe('')
  })
})
