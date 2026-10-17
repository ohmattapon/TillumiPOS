import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inject, injectable } from 'tsyringe'
import { ProductEntity } from '../../../../domains/product.domain'
import { createProductSchema } from '../schemas/product-schemas'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

import { auditPack } from './audit-pack'

/** Command. */
@injectable()
export class CreateProductUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog) { }

  async execute(input: unknown, branchId: number, actor: { id: number; displayName: string }) {
    const dto = createProductSchema.parse(input)

    return this.uow.run(async () => {
      const result = await this.products.create(
        new ProductEntity({
          id: 0,
          sku: dto.sku,
          barcode: dto.barcode ?? null,
          name: dto.name,
          categoryId: dto.categoryId ?? null,
          priceSatang: dto.priceSatang,
          costSatang: dto.costSatang ?? 0,
          trackStock: dto.trackStock ?? true,
          // New products start empty; stock arrives through the inventory module.
          stockQty: 0,
          isActive: true,
          imageKey: null,
          packs: (dto.packs ?? []).map((pack) => ({ id: 0, barcode: pack.barcode, size: pack.size, priceSatang: pack.priceSatang, isActive: pack.isActive ?? true })),
        }),
        branchId,
      )
      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'product.create',
        entityType: 'product',
        entityId: String(result.id),
        summary: 'สร้างสินค้า',
        after: { name: result.name, sku: result.sku, priceSatang: result.priceSatang, costSatang: result.costSatang, categoryId: result.categoryId, barcode: result.barcode, isActive: result.isActive, packs: result.packs.map(auditPack) },
      }))
      return result
    })
  }
}
