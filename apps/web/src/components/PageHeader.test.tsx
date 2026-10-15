import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHeader } from './PageHeader'
import { SidebarProvider } from './ui/sidebar'

function renderHeader(props: React.ComponentProps<typeof PageHeader>) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <PageHeader {...props} />
    </SidebarProvider>,
  )
}

describe('PageHeader', () => {
  test('renders without breadcrumb', () => {
    const html = renderHeader({ title: 'สินค้า' })
    expect(html).toContain('สินค้า')
  })

  test('renders breadcrumb when provided', () => {
    const html = renderHeader({ title: 'สินค้า', breadcrumb: 'จัดการ / สินค้า' })
    expect(html).toContain('จัดการ / สินค้า')
  })
})
