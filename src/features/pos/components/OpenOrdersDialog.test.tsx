import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { locales } from '../locales'
import { OpenOrdersDialog } from './OpenOrdersDialog'

const cancelMutate = mock(() => {})

mock.module('@/features/orders', () => ({
  openOrdersQuery: () => ({
    queryKey: ['open-orders'],
    queryFn: async () => ({
      items: [
        {
          id: 9,
          tableId: 3,
          label: null,
          openedByName: 'Bo',
          createdAt: '2026-10-17T10:00:00Z',
          subtotalSatang: 45000,
          itemCount: 3,
        },
      ],
      total: 1,
    }),
  }),
  useCancelOrder: () => ({ mutate: cancelMutate, isPending: false }),
}))

mock.module('@/features/settings', () => ({
  useFormat: () => ({
    money: { format: (v: number) => `${v}`, plain: (v: number) => `${v}`, parse: () => null },
    date: { dateTime: (v: string) => v, time: (v: string) => v },
  }),
  useSettings: () => ({ currency: 'THB', locale: 'th-TH' }),
  useFeatures: () => ({}),
}))

mock.module('@/features/tables', () => ({
  tablesQuery: { queryKey: ['tables'], queryFn: async () => [{ id: 3, name: 'T3' }] },
}))

let container: HTMLDivElement
let root: Root
const t18n = createInstance()

beforeEach(async () => {
  cancelMutate.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  if (!t18n.isInitialized) {
    await t18n.init({
      lng: 'th',
      fallbackLng: 'th',
      ns: ['pos'],
      defaultNS: 'pos',
      resources: { th: { pos: locales.th } },
    })
  }
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => {
    root.render(
      <I18nextProvider i18n={t18n}>
        <QueryClientProvider client={client}>
          <OpenOrdersDialog onClose={() => {}} />
        </QueryClientProvider>
      </I18nextProvider>,
    )
  })
}

async function waitFor(text: string) {
  for (let i = 0; i < 200 && !document.body.textContent?.includes(text); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function type(textarea: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('OpenOrdersDialog cancel', () => {
  test('cancel opens an alert confirmation with reason before mutating', async () => {
    render()
    await waitFor('T3')
    const cancelBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orders.cancel,
    )!
    click(cancelBtn)
    await waitFor(locales.th.orders.confirmCancel)
    expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull()
    const confirm = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orders.confirmCancel,
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    type(document.body.querySelector('textarea') as HTMLTextAreaElement, '  customer left  ')
    expect(confirm.disabled).toBe(false)
    click(confirm)
    expect(cancelMutate).toHaveBeenCalledTimes(1)
    expect(cancelMutate).toHaveBeenCalledWith({ orderId: 9, reason: 'customer left' }, expect.anything())
  })

  test('keep closes the confirmation without mutating', async () => {
    render()
    await waitFor('T3')
    const cancelBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orders.cancel,
    )!
    click(cancelBtn)
    await waitFor(locales.th.orders.confirmCancel)
    const keep = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orders.keep,
    )!
    click(keep)
    expect(cancelMutate).not.toHaveBeenCalled()
  })
})
