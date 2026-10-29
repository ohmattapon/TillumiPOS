import { and, asc, eq, exists, gt, inArray, isNull } from 'drizzle-orm'
import { allocateBillToLines } from '../../domains/bill-allocation'
import { client, db } from '../../libs/db'
import { saleItems, sales } from './schema/sales'

/**
 * Fills each line's share of the bill on sales made before the shares were kept, with the same
 * allocation a new sale gets. A sale whose lines all have their share is never selected again, so
 * running it twice is safe. Each batch is one transaction. Returns how many sales were updated.
 * `category_id` stays null on those lines, because a later category change would make it a guess.
 */
export async function backfillSaleLines(batchSize = 500): Promise<number> {
  let updated = 0
  // Paging by id keeps each batch from rescanning the sales that were already filled.
  let lastId = 0
  for (;;) {
    const done = await db.transaction(async (tx) => {
      const batch = await tx
        .select({ id: sales.id, totalSatang: sales.totalSatang, vatSatang: sales.vatSatang })
        .from(sales)
        .where(
          and(
            gt(sales.id, lastId),
            exists(tx.select({ one: saleItems.id }).from(saleItems).where(and(eq(saleItems.saleId, sales.id), isNull(saleItems.allocatedTotalSatang)))),
          ),
        )
        .orderBy(asc(sales.id))
        .limit(batchSize)
      if (batch.length === 0) return 0
      lastId = batch[batch.length - 1]!.id

      const items = await tx
        .select({ id: saleItems.id, saleId: saleItems.saleId, lineTotalSatang: saleItems.lineTotalSatang })
        .from(saleItems)
        .where(inArray(saleItems.saleId, batch.map((sale) => sale.id)))
        .orderBy(asc(saleItems.id))

      for (const sale of batch) {
        const lines = items.filter((item) => item.saleId === sale.id)
        const shares = allocateBillToLines(sale, lines.map((line) => line.lineTotalSatang))
        for (const [index, line] of lines.entries()) {
          await tx
            .update(saleItems)
            .set({ allocatedTotalSatang: shares[index]!.totalSatang, allocatedVatSatang: shares[index]!.vatSatang })
            .where(eq(saleItems.id, line.id))
        }
      }
      return batch.length
    })
    if (done === 0) return updated
    updated += done
  }
}

if (import.meta.main) {
  try {
    console.log(`Backfilled the line shares of ${await backfillSaleLines()} sales`)
  } finally {
    await client.close()
  }
}
