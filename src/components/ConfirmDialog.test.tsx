import { afterEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfirmDialog } from './ConfirmDialog'

type Props = React.ComponentProps<typeof ConfirmDialog>

let host: HTMLDivElement | null = null
let root: Root | null = null

function renderConfirm(overrides: Partial<Props> = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const props: Props = {
    open: true,
    onOpenChange: () => {},
    title: 'ลบบทบาทนี้?',
    description: 'ลบได้เมื่อไม่มีผู้ใช้ถือบทบาทนี้',
    confirmLabel: 'ลบ',
    cancelLabel: 'ยกเลิก',
    onConfirm: () => {},
    ...overrides,
  }
  act(() => {
    root!.render(<ConfirmDialog {...props} />)
  })
  return document.body
}

function buttons(body: HTMLElement) {
  return [...body.querySelectorAll('button')]
}

function buttonByText(body: HTMLElement, text: string) {
  const found = buttons(body).find((button) => button.textContent === text)
  if (!found) throw new Error(`button "${text}" not found`)
  return found
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
})

describe('ConfirmDialog', () => {
  test('renders title, description and both button labels', () => {
    const body = renderConfirm()
    expect(body.innerHTML).toContain('ลบบทบาทนี้?')
    expect(body.innerHTML).toContain('ลบได้เมื่อไม่มีผู้ใช้ถือบทบาทนี้')
    buttonByText(body, 'ลบ')
    buttonByText(body, 'ยกเลิก')
  })

  test('always renders an accessible title', () => {
    const body = renderConfirm()
    expect(body.querySelector('[data-slot="alert-dialog-title"]')?.textContent).toBe('ลบบทบาทนี้?')
  })

  test('destructive confirm uses the destructive variant', () => {
    const body = renderConfirm({ destructive: true })
    expect(buttonByText(body, 'ลบ').className).toContain('bg-destructive/10')
  })

  test('non-destructive confirm uses the default variant', () => {
    const body = renderConfirm()
    expect(buttonByText(body, 'ลบ').className).toContain('bg-primary')
  })

  test('pending shows the pending label and disables both buttons', () => {
    const body = renderConfirm({ pending: true, pendingLabel: 'กำลังลบ…' })
    buttonByText(body, 'กำลังลบ…')
    for (const button of buttons(body)) expect(button.disabled).toBe(true)
  })

  test('confirmDisabled disables only the confirm button', () => {
    const body = renderConfirm({ confirmDisabled: true })
    expect(buttonByText(body, 'ลบ').disabled).toBe(true)
    expect(buttonByText(body, 'ยกเลิก').disabled).toBe(false)
  })

  test('renders children (e.g. a reason field) inside the dialog', () => {
    const body = renderConfirm({ children: <input aria-label="เหตุผล" /> })
    expect(body.querySelector('[aria-label="เหตุผล"]')).not.toBeNull()
  })

  test('clicking confirm calls onConfirm once', () => {
    const onConfirm = mock(() => {})
    const body = renderConfirm({ onConfirm })
    click(buttonByText(body, 'ลบ'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('clicking cancel reports closed via onOpenChange', () => {
    const onOpenChange = mock(() => {})
    const body = renderConfirm({ onOpenChange })
    click(buttonByText(body, 'ยกเลิก'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
