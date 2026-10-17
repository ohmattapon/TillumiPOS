import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TableSearch } from './TableSearch'

const html = renderToStaticMarkup(<TableSearch value="กา" onChange={() => {}} label="ค้นหา" placeholder="ชื่อ" />)

describe('TableSearch', () => {
  test('labels the input for assistive technology and shows the placeholder', () => {
    expect(html).toContain('aria-label="ค้นหา"')
    expect(html).toContain('placeholder="ชื่อ"')
  })

  test('shows the value it is given', () => {
    expect(html).toContain('value="กา"')
  })

  test('the field is 44px tall', () => {
    expect(html).toMatch(/<input[^>]*h-11/)
  })
})
