import { afterEach, describe, expect, test } from 'bun:test'
import type { Server } from 'bun'
import { fakeKbank } from '../../server/test/kbank-server'
import { startFakeBankControl, startFakeBankFront, type FakeBankFront } from './fake-bank-control'
import { createSlotClaims } from './slot-claims'

const servers: Server<unknown>[] = []
afterEach(() => {
  while (servers.length) void servers.pop()!.stop(true)
  fakeKbank.reset()
})

/** The token the fake bank hands out, then a QR for `reference`, the way the API's gateway asks for one. */
async function makeQr(reference: string, baseUrl: string = fakeKbank.url) {
  const basic = Buffer.from(`${fakeKbank.credentials.consumerId}:${fakeKbank.credentials.consumerSecret}`).toString('base64')
  const token = (await (await fetch(`${baseUrl}/v2/oauth/token`, { method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' }, body: '{}' })).json()) as { accessToken: string }
  const auth = { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json' }
  const { merchantId, partnerId, partnerSecret } = fakeKbank.credentials
  await fetch(`${baseUrl}/v1/qrpayment/request`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ qrType: 3, txnCurrencyCode: 'THB', merchantId, partnerId, partnerSecret, partnerTxnUid: reference, txnAmount: '10.00', requestDt: new Date().toISOString(), reference1: reference }),
  })
  const inquire = async () =>
    (await (await fetch(`${baseUrl}/v1/qrpayment/v4/inquiry`, { method: 'POST', headers: auth, body: JSON.stringify({ partnerId, partnerSecret, merchantId, partnerTxnUid: reference }) })).json()) as { txnStatus: string }
  return { inquire }
}

function control(front?: FakeBankFront) {
  const server = startFakeBankControl(fakeKbank, 0, front)
  servers.push(server)
  return `http://127.0.0.1:${server.port}`
}

describe('startFakeBankControl', () => {
  test('POST /pay/:reference makes the fake bank report that reference paid', async () => {
    const qr = await makeQr('LOADREF1')
    expect((await qr.inquire()).txnStatus).toBe('REQUESTED')
    expect((await fetch(`${control()}/pay/LOADREF1`, { method: 'POST' })).status).toBe(200)
    expect((await qr.inquire()).txnStatus).toBe('PAID')
  })

  test('POST /cancel/:reference makes the fake bank report that reference cancelled', async () => {
    const qr = await makeQr('LOADREF2')
    expect((await fetch(`${control()}/cancel/LOADREF2`, { method: 'POST' })).status).toBe(200)
    expect((await qr.inquire()).txnStatus).toBe('CANCELLED')
  })

  test('an unknown reference is 404 and nothing is paid', async () => {
    const base = control()
    expect((await fetch(`${base}/pay/NOSUCHREF`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/cancel/NOSUCHREF`, { method: 'POST' })).status).toBe(404)
  })

  test('only POST is accepted, and other paths are 404', async () => {
    const base = control()
    expect((await fetch(`${base}/pay/X`)).status).toBe(405)
    expect((await fetch(`${base}/elsewhere`, { method: 'POST' })).status).toBe(404)
  })

  test('a request whose Host is not this machine is refused', async () => {
    const qr = await makeQr('LOADREF3')
    const base = control()
    const refused = await fetch(`${base}/pay/LOADREF3`, { method: 'POST', headers: { host: 'evil.example.com' } })
    expect(refused.status).toBe(403)
    expect((await qr.inquire()).txnStatus).toBe('REQUESTED')
  })

  test('a cross-site request is refused: a browser page adds Origin or Sec-Fetch-Site, k6 sends neither', async () => {
    const qr = await makeQr('LOADREF6')
    const base = control()
    const variants: Record<string, string>[] = [{ origin: 'http://evil.example.com' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]
    for (const header of variants) {
      const refused = await fetch(`${base}/pay/LOADREF6`, { method: 'POST', headers: header })
      expect(refused.status).toBe(403)
    }
    expect((await qr.inquire()).txnStatus).toBe('REQUESTED')
  })

  test('the front refuses a request whose Host is not this machine, and one with Origin or Sec-Fetch-Site', async () => {
    const front = startFakeBankFront(fakeKbank)
    servers.push(front.server)
    expect((await fetch(`${front.url}/v2/oauth/token`, { method: 'POST', headers: { host: 'evil.example.com' } })).status).toBe(403)
    expect((await fetch(`${front.url}/v2/oauth/token`, { method: 'POST', headers: { origin: 'http://evil.example.com' } })).status).toBe(403)
    expect((await fetch(`${front.url}/v2/oauth/token`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect(fakeKbank.requests.length).toBe(0)
  })

  test('it listens on 127.0.0.1 only', () => {
    const server = startFakeBankControl(fakeKbank, 0)
    servers.push(server)
    expect(server.hostname).toBe('127.0.0.1')
  })

  test('POST /lose-next-create/:made arms the fake bank to lose the next QR answer', async () => {
    const base = control()
    expect((await fetch(`${base}/lose-next-create/true`, { method: 'POST' })).status).toBe(200)
    expect((await fetch(`${base}/lose-next-create/maybe`, { method: 'POST' })).status).toBe(400)
  })

  describe('latency', () => {
    test('POST /latency/200 makes the next bank call take at least 200 ms, and only that one', async () => {
      const front = startFakeBankFront(fakeKbank)
      servers.push(front.server)
      const base = control(front)

      expect((await fetch(`${base}/latency/200`, { method: 'POST' })).status).toBe(200)
      let started = performance.now()
      await makeQr('LOADREF4', front.url).then((qr) => qr.inquire())
      const slow = performance.now() - started

      started = performance.now()
      await (await makeQr('LOADREF5', front.url)).inquire()
      const normal = performance.now() - started

      expect(slow).toBeGreaterThanOrEqual(195)
      expect(normal).toBeLessThan(slow)
    })

    test('a delay that is not a whole number of milliseconds in range is 400', async () => {
      const front = startFakeBankFront(fakeKbank)
      servers.push(front.server)
      const base = control(front)
      for (const bad of ['abc', '-5', '1.5', '999999'])
        expect((await fetch(`${base}/latency/${bad}`, { method: 'POST' })).status).toBe(400)
    })

    test('without a front the control says it cannot add latency', async () => {
      expect((await fetch(`${control()}/latency/50`, { method: 'POST' })).status).toBe(501)
    })
  })

  describe('claims', () => {
    const claimControl = (capacities: Record<string, number>) => {
      const server = startFakeBankControl(fakeKbank, 0, undefined, createSlotClaims(capacities))
      servers.push(server)
      return `http://127.0.0.1:${server.port}`
    }

    test('POST /claim/:scenario hands out the next slot of that scenario, then 409 when the scenario is full', async () => {
      const base = claimControl({ checkout: 2, members: 1 })
      const slot = async (scenario: string) => {
        const response = await fetch(`${base}/claim/${scenario}`, { method: 'POST' })
        return { status: response.status, body: response.status === 200 ? await response.json() : null }
      }
      expect(await slot('checkout')).toEqual({ status: 200, body: { slot: 0 } })
      expect(await slot('members')).toEqual({ status: 200, body: { slot: 0 } })
      expect(await slot('checkout')).toEqual({ status: 200, body: { slot: 1 } })
      expect((await slot('checkout')).status).toBe(409)
      expect((await slot('members')).status).toBe(409)
    })

    test('a scenario the run did not allot is 404, and a GET is 405', async () => {
      const base = claimControl({ checkout: 1 })
      expect((await fetch(`${base}/claim/stock`, { method: 'POST' })).status).toBe(404)
      expect((await fetch(`${base}/claim/checkout`)).status).toBe(405)
      // The refused GET took no slot.
      expect((await fetch(`${base}/claim/checkout`, { method: 'POST' })).status).toBe(200)
    })

    test('a control started without claims has no claim route', async () => {
      expect((await fetch(`${control()}/claim/checkout`, { method: 'POST' })).status).toBe(404)
    })

    test('a claim with a foreign Host, an Origin or a Sec-Fetch-Site is refused and takes no slot', async () => {
      const base = claimControl({ checkout: 1 })
      for (const header of [{ host: 'evil.example.com' }, { origin: 'http://evil.example.com' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[])
        expect((await fetch(`${base}/claim/checkout`, { method: 'POST', headers: header })).status).toBe(403)
      expect(await (await fetch(`${base}/claim/checkout`, { method: 'POST' })).json()).toEqual({ slot: 0 })
    })
  })
})
