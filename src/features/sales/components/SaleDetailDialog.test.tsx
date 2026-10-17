import { afterEach, describe, expect, mock, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { common } from '@/locales/common'
import { locales as salesLocales } from '../locales'

await i18n.use(initReactI18next).init({
  resources: { th: { sales: salesLocales.th, common: common.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const completedSale = {
  id: 1,
  receiptNo: 'A001',
  status: 'completed',
  payments: [{ method: 'cash', amountSatang: 5000 }],
  changeSatang: 0,
}
const voidedSale = { ...completedSale, status: 'voided' }

let fixture: typeof completedSale = completedSale
const voidMutate = mock((_reason: string, _opts?: { onSuccess?: (sale: { receiptNo: string }) => void }) => {})
const refundMutate = mock(
  (_input: { shiftId: number; reason: string }, _opts?: { onSuccess?: () => void }) => {},
)

mock.module('../api', () => ({
  saleQuery: (id: number) => ({ queryKey: ['sale-test', id], queryFn: async () => fixture }),
  useVoidSale: () => ({ mutate: voidMutate, isPending: false, error: null }),
  useCashRefund: () => ({ mutate: refundMutate, isPending: false, error: null }),
}))

mock.module('@/features/shifts', () => ({
  registersQuery: {
    queryKey: ['registers-test'],
    queryFn: async () => ({ items: [{ id: 7, isActive: true }], total: 1 }),
  },
  currentShiftQuery: () => ({ queryKey: ['shift-test'], queryFn: async () => ({ id: 11 }) }),
}))

mock.module('@/features/settings', () => ({
  useFormat: () => ({
    money: { format: (n: number) => String(n), plain: (n: number) => String(n), parse: () => null },
    date: { dateTime: () => '' },
    currency: 'THB',
    locale: 'th-TH',
  }),
  useSettings: () => ({ currency: 'THB', locale: 'th-TH' }),
  useFeatures: () => ({}),
}))

mock.module('./Receipt', () => ({
  Receipt: () => <div data-testid="receipt" />,
}))

const { SaleDetailDialog } = await import('./SaleDetailDialog')

const t = salesLocales.th.detail

let host: HTMLDivElement | null = null
let root: Root | null = null

async function renderDialog() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <SaleDetailDialog saleId={1} canVoid onClose={() => {}} />
      </QueryClientProvider>,
    )
  })
  for (let i = 0; i < 50; i += 1) {
    if ([...document.body.querySelectorAll('button')].some((b) => b.textContent === t.voidSale)) break
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return document.body
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll('button')].find((button) => button.textContent === text)
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

function dialogScope(body: HTMLElement) {
  const dialog = body.querySelector('[data-slot="alert-dialog-content"]')
  if (!dialog) throw new Error('confirm dialog not found')
  return dialog as HTMLElement
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function typeText(area: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(area, text)
    area.dispatchEvent(new Event('input', { bubbles: true }))
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
  fixture = completedSale
  voidMutate.mockClear()
  refundMutate.mockClear()
})

describe('SaleDetailDialog destructive confirms', () => {
  test('void asks for a reason and deletes nothing without one', async () => {
    const body = await renderDialog()
    click(buttonByText(body, t.voidSale))
    const dialog = dialogScope(body)
    expect(dialog.innerHTML).toContain(t.voidWarning)
    const area = dialog.querySelector('textarea') as HTMLTextAreaElement
    expect(buttonByText(dialog, t.confirmVoid).disabled).toBe(true)
    typeText(area, '   ')
    expect(buttonByText(dialog, t.confirmVoid).disabled).toBe(true)
    expect(voidMutate).not.toHaveBeenCalled()
  })

  test('void confirms with the trimmed reason', async () => {
    const body = await renderDialog()
    click(buttonByText(body, t.voidSale))
    const dialog = dialogScope(body)
    typeText(dialog.querySelector('textarea') as HTMLTextAreaElement, '  ลูกค้าเปลี่ยนใจ  ')
    click(buttonByText(dialog, t.confirmVoid))
    expect(voidMutate).toHaveBeenCalledTimes(1)
    expect(voidMutate).toHaveBeenCalledWith('ลูกค้าเปลี่ยนใจ', expect.anything())
  })

  test('cash refund on a voided cash sale goes through a confirm', async () => {
    fixture = voidedSale
    const body = await renderDialog()
    click(buttonByText(body, t.cashRefund))
    const dialog = dialogScope(body)
    typeText(dialog.querySelector('textarea') as HTMLTextAreaElement, 'คืนเงินแล้ว')
    click(buttonByText(dialog, t.confirmRefund))
    expect(refundMutate).toHaveBeenCalledTimes(1)
    expect(refundMutate).toHaveBeenCalledWith({ shiftId: 11, reason: 'คืนเงินแล้ว' }, expect.anything())
  })
})
