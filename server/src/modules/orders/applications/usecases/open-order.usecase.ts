import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { IOrderRepository } from '../ports/order.repository'
import { tableRepositoryToken } from '../../../tables/applications/ports/table.repository'
import type { ITableRepository } from '../../../tables/applications/ports/table.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import type { OrderActor } from '../services/order-access'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { OrderEntity } from '../../../../domains/order.domain'
import { TOKENS } from '../../../tokens'
import { findOrderedProduct } from '../services/ordered-product'
import { findUsableTable } from '../services/order-table'
import { inject, injectable } from 'tsyringe'
import { openOrderSchema } from '../schemas/order-schemas'
import { orderRepositoryToken } from '../ports/order.repository'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'

/** Command: opens an order, optionally with its first lines. */
@injectable()
export class OpenOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
  ) {}

  async execute(input: unknown, actor: OrderActor) {
    const dto = openOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      if (dto.tableId) await findUsableTable(this.tables, dto.tableId, actor.branch.id)

      if (dto.memberId != null) {
        const member = await this.members.findByIdForUpdate(dto.memberId)
        if (!member) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
        member.assertActive()
      }
      const items = []
      for (const line of dto.items ?? []) {
        const product = await findOrderedProduct(this.products, line.productId, actor.branch.id)
        const chosen = await this.lineOptions.resolve(line.productId, line.options ?? [])
        items.push({
          ...product,
          unitPriceSatang: product.unitPriceSatang + chosen.priceSatang,
          quantity: line.quantity,
          lineId: 0,
          options: chosen.options,
          note: null,
        })
      }

      return this.orders.create(
        OrderEntity.open({
          memberId: dto.memberId ?? null,
          branchId: actor.branch.id,
          label: dto.label ?? null,
          tableId: dto.tableId ?? null,
          openedById: actor.user.id,
          openedByName: actor.user.displayName,
          items,
        }),
      )
    })
  }
}
