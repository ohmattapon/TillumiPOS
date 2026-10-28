import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Panel } from './Panel'

describe('Panel', () => {
  test('shows the title, the content and the action, and no description line when there is none', () => {
    const html = renderToStaticMarkup(<Panel title="ยอดขาย" action={<button>ส่งออก</button>}>เนื้อหา</Panel>)

    expect(html).toContain('ยอดขาย')
    expect(html).toContain('ส่งออก')
    expect(html).toContain('เนื้อหา')
    expect(html).not.toContain('text-xs text-muted-foreground')
  })

  test('shows the description under the title, and lets the page add classes', () => {
    const html = renderToStaticMarkup(<Panel title="ยอดขาย" description="7 วันล่าสุด" className="h-96">x</Panel>)

    expect(html).toContain('7 วันล่าสุด')
    expect(html).toContain('h-96')
  })
})
