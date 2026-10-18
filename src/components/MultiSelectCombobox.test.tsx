import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MultiSelectCombobox } from './MultiSelectCombobox'

const render = (label: string, selectedIds: number[] = []) =>
  renderToStaticMarkup(
    <MultiSelectCombobox
      label={label}
      searchLabel="ค้นหา"
      emptyText="ไม่พบ"
      items={[{ id: 1, label: 'เครื่องดื่ม' }]}
      selectedIds={selectedIds}
      onToggle={() => {}}
    />,
  )

describe('MultiSelectCombobox', () => {
  test('is a closed combobox button named by what it says', () => {
    const html = render('เลือกหมวดหมู่')

    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-label="เลือกหมวดหมู่"')
    expect(html).toContain('เลือกหมวดหมู่')
  })

  test('keeps the list out of the page until it is opened', () => {
    expect(render('เลือกหมวดหมู่')).not.toContain('role="listbox"')
  })

  test('says how many are chosen when the caller puts that on the button', () => {
    expect(render('เลือกแล้ว 2 รายการ', [1, 2])).toContain('เลือกแล้ว 2 รายการ')
  })
})
