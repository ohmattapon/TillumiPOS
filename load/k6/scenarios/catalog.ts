// Read-only catalog traffic: the product list with pagination, search by name, lookup by barcode and pack barcode,
// categories and modifier groups. This is what a till and the product screens do all day.
import { sleep } from 'k6'
import { login } from '../lib/auth.ts'
import { api, type Session } from '../lib/client.ts'
import { expectPage } from '../lib/checks.ts'
import { config } from '../lib/config.ts'

const PAGE_SIZE = 50

/** Thresholds for the scenario's own requests; merged into the profile's options. */
export const options = {
  thresholds: {
    'http_req_duration{scenario:catalog}': ['p(95)<300'],
  },
}

interface ProductRow {
  name: string
  barcode: string | null
  packs: { barcode: string; isActive: boolean }[]
}

// One login per VU: k6 keeps module state for the life of a VU.
let session: Session | undefined

export function catalog() {
  const { users } = config()
  session ??= login(users[(__VU - 1) % users.length]!)
  const client = api(session)

  // Walk the list page by page, so successive iterations cover the whole catalog.
  const first = client.get(`/api/v1/catalog/products/?limit=${PAGE_SIZE}&offset=0`, { expect: [200], name: 'catalog.products.list' })
  const total = first.status === 200 ? (first.json('total') as number) : 0
  const offset = total > PAGE_SIZE ? (__ITER * PAGE_SIZE) % total : 0
  const items = expectPage<ProductRow>(
    offset === 0 ? first : client.get(`/api/v1/catalog/products/?limit=${PAGE_SIZE}&offset=${offset}`, { expect: [200], name: 'catalog.products.page' }),
    'product list',
    { minItems: 1 },
  )
  const picked = items[__ITER % Math.max(items.length, 1)]

  if (picked) {
    const word = picked.name.split(' ')[0] ?? picked.name
    expectPage(client.get(`/api/v1/catalog/products/?q=${encodeURIComponent(word)}&limit=${PAGE_SIZE}`, { expect: [200], name: 'catalog.products.search' }), 'search by name', { minItems: 1 })
    if (picked.barcode)
      expectPage(client.get(`/api/v1/catalog/products/?code=${encodeURIComponent(picked.barcode)}`, { expect: [200], name: 'catalog.products.barcode' }), 'barcode lookup', { minItems: 1 })
  }
  const packed = items.find((item) => item.packs.length > 0)
  if (packed)
    expectPage(client.get(`/api/v1/catalog/products/?code=${encodeURIComponent(packed.packs[0]!.barcode)}`, { expect: [200], name: 'catalog.products.pack-barcode' }), 'pack barcode lookup', { minItems: 1 })

  expectPage(client.get('/api/v1/catalog/categories/', { expect: [200], name: 'catalog.categories' }), 'categories')
  expectPage(client.get('/api/v1/catalog/modifier-groups', { expect: [200], name: 'catalog.modifier-groups' }), 'modifier groups')
  sleep(1)
}
