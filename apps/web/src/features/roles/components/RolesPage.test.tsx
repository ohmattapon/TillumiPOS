import { afterEach, describe, expect, mock, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarProvider } from '@/components/ui/sidebar'
import { common } from '@/locales/common'
import { locales as rolesLocales } from '../locales'

await i18n.use(initReactI18next).init({
  resources: { th: { roles: rolesLocales.th, common: common.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const mutate = mock((_id: number, _opts?: { onSuccess?: () => void }) => {})

mock.module('../api', () => ({
  rolesQuery: () => ({
    queryKey: ['roles-test'],
    queryFn: async () => ({
      items: [
        { id: 1, name: 'พนักงาน', systemKey: null, userCount: 0, permissions: [] },
        { id: 2, name: 'เจ้าของ', systemKey: 'owner', userCount: 1, permissions: [] },
      ],
      total: 2,
    }),
  }),
  useDeleteRole: () => ({ mutate, isPending: false, error: null }),
  useCreateRole: () => ({ mutate: () => {}, isPending: false, error: null }),
  useUpdateRole: () => ({ mutate: () => {}, isPending: false, error: null }),
  roleKeys: { all: ['roles-test'] },
}))

const { RolesPage } = await import('./RolesPage')

let host: HTMLDivElement | null = null
let root: Root | null = null

async function renderPage() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <SidebarProvider>
        <QueryClientProvider client={client}>
          <RolesPage />
        </QueryClientProvider>
      </SidebarProvider>,
    )
  })
  for (let i = 0; i < 50; i += 1) {
    if ([...document.body.querySelectorAll('button')].some((b) => b.textContent === 'ลบ')) break
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return document.body
}

function buttonByText(body: HTMLElement, text: string, onlyEnabled = false) {
  const found = [...body.querySelectorAll('button')].find(
    (button) => button.textContent === text && (!onlyEnabled || !(button as HTMLButtonElement).disabled),
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  mutate.mockClear()
})

describe('RolesPage delete', () => {
  test('remove opens an AlertDialog confirm, confirming deletes with the role id', async () => {
    const body = await renderPage()
    click(buttonByText(body, 'ลบ', true))
    expect(body.querySelector('[data-slot="alert-dialog-title"]')?.textContent).toBe('ลบบทบาทนี้?')
    expect(body.innerHTML).toContain('พนักงาน')
    const dialog = body.querySelector('[data-slot="alert-dialog-content"]')
    if (!dialog) throw new Error('confirm dialog not found')
    const confirm = buttonByText(dialog as HTMLElement, 'ลบ')
    expect(confirm.className).toContain('bg-destructive/10')
    click(confirm)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(1, expect.anything())
  })

  test('cancel closes the dialog without deleting', async () => {
    const body = await renderPage()
    click(buttonByText(body, 'ลบ', true))
    click(buttonByText(body, 'ยกเลิก'))
    expect(body.querySelector('[data-slot="alert-dialog-title"]')).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  test('system role delete stays disabled', async () => {
    const body = await renderPage()
    const removes = [...body.querySelectorAll('button')].filter((b) => b.textContent === 'ลบ')
    expect(removes.length).toBeGreaterThan(0)
    expect(removes.some((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(removes.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })
})
