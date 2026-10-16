import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { IOrderEditLock } from '../../../orders/applications/ports/order-edit-lock.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'

@injectable()
export class OrderEditLock implements IOrderEditLock {
  constructor(@inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository) {}

  async assertEditable(orderId: number) {
    if (await this.quotes.hasReservedForOrder(orderId))
      throw new DomainConflictError(
        'ออเดอร์นี้กำลังรอการชำระด้วย QR แก้ไขไม่ได้จนกว่าจะยกเลิก QR หรือรับเงินเสร็จ',
        'ORDER_LOCKED_BY_QR_PAYMENT',
      )
  }
}
