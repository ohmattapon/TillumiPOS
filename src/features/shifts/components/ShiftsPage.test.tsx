import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { SidebarProvider } from '@/components/ui/sidebar'
import { locales } from '../locales'
import { ShiftsPage } from './ShiftsPage'

const closeMutate = mock(() => {})
const cancelClosingMutate = mock(() => {})
const startClosingMutate = mock(() => {})

let shiftStatus: 'open' | 'closing' = 'closing'

mock.module('../api', () => ({
  checkoutModeQuery: { queryKey: ['checkout-mode'], queryFn: async () => ({ checkoutMode: 'shifts' }) },
  currentShiftQuery: (id: number) => ({
    queryKey: ['current-shift', id],
    queryFn: async () => ({
      id: 1,
      registerId: 5,
      status: shiftStatus,
      openedByName: 'Bo',
      openedAt: '2026-10-17T09:00:00Z',
    }),
  }),
  registersQuery: {
    queryKey: ['registers'],
    queryFn: async () => ({ items: [{ id: 5, code: 'R1', name: 'Reg1', isActive: true }], total: 1 }),
  },
  useCancelClosing: () => ({ mutate: cancelClosingMutate, isPending: false }),
  useCloseShift: () => ({ mutate: closeMutate, isPending: false }),
  useCreateRegister: () => ({ mutate: () => {}, isPending: false }),
  useOpenShift: () => ({ mutate: () => {}, isPending: false }),
  useRecordCashMovement: () => ({ mutate: () => {}, isPending: false }),
  useStartClosing: () => ({ mutate: startClosingMutate, isPending: false }),
  useUpdateRegister: () => ({ mutate: () => {}, isPending: false }),
}))

mock.module('@/lib/api', () => ({
  apiV2: {
    shifts: (id: number) => ({
      get: async () => ({
        id,
        status: 'closing',
        closingStartedById: 9,
        closingRevision: 3,
        closingExpectedCashSatang: 10000,
        currency: 'THB',
      }),
    }),
  },
  unwrap: (promise: unknown) => promise,
}))

mock.module('@/features/auth', () => ({
  meQuery: { queryKey: ['me'], queryFn: async () => ({ id: 9 }) },
  useAuthorization: () => ({ can: () => true }),
}))

mock.module('@/features/branches', () => ({
  useActiveBranch: () => ({ branch: { id: 1 } }),
}))

mock.module('@/features/settings', () => ({
  useFormat: () => ({
    money: {
      format: (v: number) => `${v}`,
      plain: (v: number) => `${v}`,
      parse: (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100)),
    },
    date: { dateTime: (v: string) => v, time: (v: string) => v },
  }),
  useSettings: () => ({ currency: 'THB', locale: 'th-TH' }),
  useFeatures: () => ({}),
}))

mock.module('./QrRecoveryPanel', () => ({ QrRecoveryPanel: () => null }))
mock.module('./ShiftHistoryPanel', () => ({ ShiftHistoryPanel: () => null }))
mock.module('./ShiftSummaryView', () => ({ ShiftSummaryView: () => null }))
mock.module('./ShiftEntriesPanel', () => ({ ShiftEntriesPanel: () => null }))

let container: HTMLDivElement
let root: Root
const t18n = createInstance()

beforeEach(async () => {
  closeMutate.mockClear()
  cancelClosingMutate.mockClear()
  startClosingMutate.mockClear()
  shiftStatus = 'closing'
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
          <SidebarProvider>
            <ShiftsPage />
          </SidebarProvider>
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
  expect(document.body.textContent).toContain(text)
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function confirmInDialog(text: string) {
  const dialog = document.body.querySelector('[data-slot="alert-dialog-content"]')
  expect(dialog).not.toBeNull()
  const confirm = [...dialog!.querySelectorAll('button')].find((b) => b.textContent === text)
  expect(confirm).toBeDefined()
  click(confirm!)
}

function typeInput(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function countedCashInput() {
  const label = [...document.body.querySelectorAll('label')].find((l) =>
    l.textContent?.includes(locales.th.countedCash),
  )
  expect(label).toBeDefined()
  return label!.querySelector('input') as HTMLInputElement
}

describe('ShiftsPage close', () => {
  test('closing the shift asks for confirmation and passes the counted cash', async () => {
    render()
    await waitFor(locales.th.closeAction)
    typeInput(countedCashInput(), '100')
    const closeBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.closeAction && !b.closest('[data-slot="alert-dialog-content"]'),
    ) as HTMLButtonElement
    expect(closeBtn.disabled).toBe(false)
    click(closeBtn)
    await waitFor(locales.th.countedCash)
    confirmInDialog(locales.th.closeAction)
    expect(closeMutate).toHaveBeenCalledTimes(1)
    expect(closeMutate).toHaveBeenCalledWith(
      { id: 1, closingRevision: 3, countedCashSatang: 10000 },
      expect.anything(),
    )
  })

  test('cancelling the count asks for confirmation before mutating', async () => {
    render()
    await waitFor(locales.th.cancelCounting)
    const cancelBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.cancelCounting && !b.closest('[data-slot="alert-dialog-content"]'),
    )!
    click(cancelBtn)
    confirmInDialog(locales.th.cancelCounting)
    expect(cancelClosingMutate).toHaveBeenCalledTimes(1)
    expect(cancelClosingMutate).toHaveBeenCalledWith({ id: 1, closingRevision: 3 }, expect.anything())
  })

  test('starting the count asks for confirmation before mutating', async () => {
    shiftStatus = 'open'
    render()
    await waitFor(locales.th.startCounting)
    const startBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.startCounting && !b.closest('[data-slot="alert-dialog-content"]'),
    )!
    click(startBtn)
    confirmInDialog(locales.th.startCounting)
    expect(startClosingMutate).toHaveBeenCalledTimes(1)
    expect(startClosingMutate).toHaveBeenCalledWith({ id: 1 }, expect.anything())
  })
})
