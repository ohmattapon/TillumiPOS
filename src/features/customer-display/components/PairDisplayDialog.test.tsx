import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { locales } from '../locales'
import { PairDisplayDialog } from './PairDisplayDialog'

const unpairMutate = mock(() => {})
const pairMutate = mock(() => {})

mock.module('../api', () => ({
  displayPairingQuery: () => ({
    queryKey: ['pairing'],
    queryFn: async () => ({ displays: 2 }),
  }),
  usePairDisplay: () => ({ mutate: pairMutate, isPending: false, error: null }),
  useUnpairDisplay: () => ({ mutate: unpairMutate, isPending: false, error: null }),
}))

let container: HTMLDivElement
let root: Root
const t18n = createInstance()

beforeEach(async () => {
  unpairMutate.mockClear()
  pairMutate.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  if (!t18n.isInitialized) {
    await t18n.init({
      lng: 'th',
      fallbackLng: 'th',
      ns: ['customerDisplay'],
      defaultNS: 'customerDisplay',
      resources: { th: { customerDisplay: locales.th } },
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
          <PairDisplayDialog open onOpenChange={() => {}} registerId={5} />
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

describe('PairDisplayDialog unpair', () => {
  test('disconnect opens an alert confirmation before mutating', async () => {
    render()
    await waitFor(locales.th.pair.connected_other.replace('{{count}}', '2'))
    const disconnectBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.pair.disconnect,
    )!
    click(disconnectBtn)
    await waitFor(locales.th.pair.unpairDescription)
    expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull()
    const confirm = [...document.body.querySelectorAll('button')].find(
      (b) =>
        b.textContent === locales.th.pair.disconnect &&
        b.closest('[data-slot="alert-dialog-content"]') !== null,
    ) as HTMLButtonElement
    click(confirm)
    expect(unpairMutate).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull()
  })

  test('cancel closes the confirmation without mutating', async () => {
    render()
    await waitFor(locales.th.pair.connected_other.replace('{{count}}', '2'))
    const disconnectBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === locales.th.pair.disconnect,
    )!
    click(disconnectBtn)
    await waitFor(locales.th.pair.unpairDescription)
    const cancel = [...document.body.querySelectorAll('button')].find(
      (b) =>
        b.closest('[data-slot="alert-dialog-content"]') !== null &&
        b.textContent !== locales.th.pair.disconnect,
    )!
    click(cancel)
    expect(unpairMutate).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull()
  })
})
