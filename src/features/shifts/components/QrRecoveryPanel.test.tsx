import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { locales } from '../locales'
import { QrRecoveryPanel } from './QrRecoveryPanel'

const dismissMutate = mock(() => {})
const resolveMutate = mock(() => {})

mock.module('../api', () => ({
  unresolvedQrAttemptsQuery: () => ({ queryKey: ['attempts'], queryFn: async () => ({ items: [], total: 0 }) }),
  unclaimedQrQuery: () => ({
    queryKey: ['unclaimed'],
    queryFn: async () => ({
      items: [{ id: 7, amountSatang: 12000, payerName: 'A', paidAt: '2026-10-17T10:00:00Z', reference: 'REF7' }],
      total: 1,
    }),
  }),
  useDismissQrPayment: () => ({ mutate: dismissMutate, isPending: false }),
  useResolveQrAttempt: () => ({ mutate: resolveMutate, isPending: false }),
}))

mock.module('@/features/settings', () => ({
  useFormat: () => ({
    money: { format: (v: number) => `${v}`, parse: () => null },
    date: { dateTime: (v: string) => v },
  }),
}))

mock.module('@/hooks/use-list-pagination', () => ({
  useListPagination: () => ({ page: 0, pageSize: 10, offset: 0, setPage: () => {} }),
}))

let container: HTMLDivElement
let root: Root
const t18n = createInstance()

beforeEach(async () => {
  dismissMutate.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  if (!t18n.isInitialized) {
    await t18n.init({
      lng: 'th',
      fallbackLng: 'th',
      ns: ['shifts'],
      defaultNS: 'shifts',
      resources: { th: { shifts: locales.th } },
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
          <QrRecoveryPanel isOwner />
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

describe('QrRecoveryPanel dismiss', () => {
  test('dismiss opens an alert confirmation with reason before mutating', async () => {
    render()
    await waitFor('REF7')
    const dismissBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.qr.dismiss,
    )!
    click(dismissBtn)
    await waitFor(locales.th.qr.confirmDismiss)
    expect(document.body.querySelector('[data-slot=\"alert-dialog-content\"]')).not.toBeNull()
    const confirm = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.qr.confirmDismiss,
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    type(document.body.querySelector('textarea') as HTMLTextAreaElement, '  bank refunded  ')
    expect(confirm.disabled).toBe(false)
    click(confirm)
    expect(dismissMutate).toHaveBeenCalledTimes(1)
    expect(dismissMutate).toHaveBeenCalledWith({ id: 7, reason: 'bank refunded' }, expect.anything())
  })

  test('cancel closes the confirmation without mutating', async () => {
    render()
    await waitFor('REF7')
    const dismissBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.qr.dismiss,
    )!
    click(dismissBtn)
    await waitFor(locales.th.qr.confirmDismiss)
    const keep = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.qr.keep,
    )!
    click(keep)
    expect(dismissMutate).not.toHaveBeenCalled()
  })
})
