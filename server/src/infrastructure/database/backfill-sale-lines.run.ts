import { client } from '../../libs/db'
import { backfillSaleLines } from './backfill-sale-lines'

try {
  console.log(`Backfilled the line shares of ${await backfillSaleLines()} sales`)
} finally {
  await client.close()
}
