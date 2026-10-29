import type { FakeKbank } from './kbank-server'

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * A page for a developer to play the customer against the fake bank: it lists the QRs the till
 * made and pays one on request. The fake keeps no list of paid QRs, so this keeps its own.
 */
export function kbankDevControl(bank: Pick<FakeKbank, 'created' | 'pay'>) {
  const paid = new Set<string>()
  const rows = () => [...bank.created].map(([reference, qr]) => ({ reference, amount: qr.amount, paid: paid.has(reference) }))

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)

    if (request.method === 'GET' && pathname === '/qrs') return Response.json(rows())

    if (request.method === 'POST' && pathname.startsWith('/pay/')) {
      const reference = decodeURIComponent(pathname.slice('/pay/'.length))
      if (!bank.created.has(reference)) return new Response('unknown QR', { status: 404 })
      bank.pay(reference)
      paid.add(reference)
      return new Response(null, { status: 303, headers: { location: '/' } })
    }

    if (request.method === 'GET' && pathname === '/') {
      const items = rows()
        .map(({ reference, amount, paid }) =>
          paid
            ? `<li>${escapeHtml(reference)} &mdash; ${amount} THB &mdash; paid</li>`
            : `<li>${escapeHtml(reference)} &mdash; ${amount} THB <form method="post" action="/pay/${encodeURIComponent(reference)}" style="display:inline"><button>Pay</button></form></li>`,
        )
        .join('')
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Fake KBank</title><meta http-equiv="refresh" content="3"><h1>Fake KBank</h1><ul>${items || '<li>No QR yet</li>'}</ul>`,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }

    return new Response('not found', { status: 404 })
  }
}
