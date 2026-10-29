import { describe, expect, it } from 'bun:test'
import { kbankDevControl } from './kbank-dev-control'

const fakeBank = () => {
  const paid: string[] = []
  return {
    paid,
    created: new Map([['QRAAA', { amount: '120.00', reference1: 'MAIN' }]]),
    pay: (reference: string) => void paid.push(reference),
  }
}

describe('kbankDevControl', () => {
  it('lists the QRs the fake bank has made, with their paid state', async () => {
    const bank = fakeBank()
    const control = kbankDevControl(bank)
    await control(new Request('http://x/pay/QRAAA', { method: 'POST' }))

    const answer = await control(new Request('http://x/qrs'))

    expect(await answer.json()).toEqual([{ reference: 'QRAAA', amount: '120.00', paid: true }])
  })

  it('marks a QR as paid by the customer', async () => {
    const bank = fakeBank()
    const control = kbankDevControl(bank)

    const answer = await control(new Request('http://x/pay/QRAAA', { method: 'POST' }))

    expect(answer.status).toBe(303)
    expect(bank.paid).toEqual(['QRAAA'])
  })

  it('refuses to pay a QR the bank never made', async () => {
    const bank = fakeBank()
    const control = kbankDevControl(bank)

    const answer = await control(new Request('http://x/pay/NOSUCH', { method: 'POST' }))

    expect(answer.status).toBe(404)
    expect(bank.paid).toEqual([])
  })

  it('shows a page with a pay button for each unpaid QR', async () => {
    const control = kbankDevControl(fakeBank())

    const page = await (await control(new Request('http://x/'))).text()

    expect(page).toContain('QRAAA')
    expect(page).toContain('action="/pay/QRAAA"')
  })
})
