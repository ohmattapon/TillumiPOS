import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

/** A station and a category routed to it, with one product in that category. */
async function kitchenProduct(stationName = 'ครัว') {
  const station = ok(await owner.api.catalog['kitchen-stations'].post({ name: stationName }))
  const category = ok(await owner.api.catalog.categories.post({ name: `หมวด ${stationName}` }))
  ok(await owner.api.catalog.categories({ id: category.id })['kitchen-station'].put({ stationId: station.id }))
  const product = await seedProduct(owner, { categoryId: category.id, stock: 10 })
  return { station, product }
}

const send = (session: Session, orderId: number) => session.api.orders({ id: orderId })['kitchen-send'].post()

describe('ส่งครัวและจอครัว', () => {
  test('สถานีถูกสร้างเป็นของร้าน และแคชเชียร์เพิ่มไม่ได้', async () => {
    const denied = await cashier.api.catalog['kitchen-stations'].post({ name: 'บาร์' })

    expect(denied.status).toBe(403)
    ok(await owner.api.catalog['kitchen-stations'].post({ name: 'บาร์' }))
    expect(ok(await cashier.api.catalog['kitchen-stations'].get()).items.map((row) => row.name)).toEqual(['บาร์'])
  })

  test('ส่งครัวแยกใบต่อสถานี และส่งซ้ำได้เฉพาะส่วนที่ยังไม่เคยส่ง', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 2 }] }))

    const first = ok(await send(cashier, order.id))
    expect(first.items).toHaveLength(1)
    expect(first.items[0]!.stationId).toBe(station.id)
    expect(first.items[0]!.roundNo).toBe(1)

    const again = await send(cashier, order.id)
    expect(again.status).toBe(400)
    expect(again.error?.value).toMatchObject({ code: 'KITCHEN_NOTHING_TO_SEND' })
  })

  test('กดส่งพร้อมกันสองครั้งไม่เกิดใบซ้ำ', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 3 }] }))

    const [a, b] = await Promise.all([send(cashier, order.id), send(cashier, order.id)])
    const statuses = [a.status, b.status].sort()

    expect(statuses).toEqual([200, 400])
  })

  test('ลดจำนวนหลังส่ง ยกเลิกส่วนนั้นบนจอ และเพิ่มกลับส่งได้เฉพาะส่วนที่ยังไม่ส่ง', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 3 }] }))
    ok(await send(cashier, order.id))

    const lineId = ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.lineId
    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).patch({ quantity: 1 }))
    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items[0]!.lines[0]).toMatchObject({ quantity: 3, voidedQuantity: 2 })

    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).patch({ quantity: 2 }))
    const resent = ok(await send(cashier, order.id))
    expect(resent.items[0]!.lines[0]!.quantity).toBe(1)
  })

  test('ยกเลิกออเดอร์ทำให้ใบยังอยู่บนจอจนครัวกดเสร็จ และกดซ้ำไม่ได้', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const sent = ok(await send(cashier, order.id)).items[0]!

    ok(await cashier.api.orders({ id: order.id }).cancel.post({ reason: 'ลูกค้าไปแล้ว' }))
    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items.map((ticket) => ticket.id)).toContain(sent.id)
    expect(board.items[0]!.lines[0]!.voidedQuantity).toBe(1)

    ok(await cashier.api.kitchen.tickets({ id: sent.id }).done.post())
    const again = await cashier.api.kitchen.tickets({ id: sent.id }).done.post()
    expect(again.status).toBe(409)
  })

  test('การส่งครัวไม่ตัดสต็อก', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 4 }] }))

    ok(await send(cashier, order.id))

    const listed = ok(await cashier.api.catalog.products.get({ query: { q: product.sku } })).items[0]!
    expect(listed.stockQty).toBe(10)
  })

  test('รวมบิลไม่ได้ขณะมีใบค้าง และเมื่อเสร็จแล้วใบย้ายไปปลายทาง', async () => {
    const { station, product } = await kitchenProduct()
    const destination = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const source = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const pending = ok(await send(cashier, source.id)).items[0]!

    const blocked = await cashier.api.orders({ id: destination.id }).merge.post({ sourceOrderId: source.id })
    expect(blocked.status).toBe(409)

    ok(await cashier.api.kitchen.tickets({ id: pending.id }).done.post())
    ok(await cashier.api.orders({ id: destination.id }).merge.post({ sourceOrderId: source.id }))

    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items).toHaveLength(0)
  })

  test('ออเดอร์และใบของสาขาอื่นตอบว่าไม่พบ', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const sent = ok(await send(cashier, order.id)).items[0]!
    const other = await seedBranch('CNX', 'สาขาเชียงใหม่')
    const elsewhere = await signIn('cashier', 'cashier-cnx', { branchId: other.id })

    expect((await send(elsewhere, order.id)).status).toBe(404)
    expect((await elsewhere.api.kitchen.tickets({ id: sent.id }).done.post()).status).toBe(404)
    expect(ok(await elsewhere.api.kitchen.tickets.get({ query: { stationId: station.id } })).items).toHaveLength(0)
  })

  test('หมายเหตุแก้ได้ก่อนส่ง และถูกปฏิเสธหลังส่ง', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const lineId = ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.lineId

    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: '  ไม่ใส่น้ำแข็ง ' }))
    expect(ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.note).toBe('ไม่ใส่น้ำแข็ง')

    ok(await send(cashier, order.id))
    const late = await cashier.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: 'หวาน' })
    expect(late.status).toBe(409)
  })
})
