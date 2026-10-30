import { describe, expect, test } from 'bun:test'
import { isShopHealthy } from './health'

const SHOP = 'http://127.0.0.1:3000'

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = []
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    return respond(url)
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

describe('isShopHealthy', () => {
  test('asks the health route of the shop origin', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json({ status: 'ok' }))
    expect(await isShopHealthy(SHOP, fetchImpl)).toBe(true)
    expect(calls).toEqual(['http://127.0.0.1:3000/api/v1/health'])
  })

  test('a failing status is not healthy', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('down', { status: 503 }))
    expect(await isShopHealthy(SHOP, fetchImpl)).toBe(false)
  })

  test('a 200 that is not the health answer is not healthy', async () => {
    // Something else may be listening on the port; only the API's own answer counts.
    expect(await isShopHealthy(SHOP, fakeFetch(() => new Response('<html>')).fetchImpl)).toBe(false)
    expect(await isShopHealthy(SHOP, fakeFetch(() => Response.json({ status: 'starting' })).fetchImpl)).toBe(false)
    expect(await isShopHealthy(SHOP, fakeFetch(() => Response.json(null)).fetchImpl)).toBe(false)
  })

  test('a network error is not healthy and does not throw', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError('connection refused')
    })
    expect(await isShopHealthy(SHOP, fetchImpl)).toBe(false)
  })
})
