import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { locales } from '../locales'
import { OrderQrHold } from './OrderQrHold'

const cancelMutate = mock(() => {})

mock.module('../api', () => ({
  orderQrHoldQuery: () => ({
    queryKey: ['hold'],
    queryFn: async () => ({ id: 5, status: 'pending', amountSatang: 12000 }),
  }),
  qrKeys: { orderHold: (id: number) => ['qr-hold', id] },
  useCreateQrPayment: () => ({ mutate: () => {}, isPending: false }),
  useCancelQrPayment: () => ({ mutate: cancelMutate, isPending: false }),
}))

mock.module('@/features/shifts', () => ({
  checkoutModeQuery: { queryKey: ['mode'], queryFn: async () => ({ checkoutMode: 'shifts' as const }) },
}))

mock.module('@/features/settings', () => ({
  useFormat: () => ({
    money: { format: (v: number) => `${v}`, parse: () => null },
    date: { dateTime: (v: string) => v },
  }),
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
          <OrderQrHold orderId={3} />
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

describe('OrderQrHold cancel', () => {
  test('cancel asks for alert confirmation before mutating', async () => {
    render()
    await waitFor(locales.th.orderHold.cancel)
    const cancelBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orderHold.cancel,
    )!
    click(cancelBtn)
    await waitFor(locales.th.orderHold.confirmTitle)
    expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull()
    const confirm = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.orderHold.confirm,
    )!
    click(confirm)
    expect(cancelMutate).toHaveBeenCalledTimes(1)
    expect(cancelMutate).toHaveBeenCalledWith({ id: 5, inShift: true }, expect.anything())
  })
})
