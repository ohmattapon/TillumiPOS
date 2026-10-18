import { auditChanges } from '../../../../domains/audit-changes'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { updateProductSchema } from '../schemas/product-schemas'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Command. */
@injectable()
export class UpdateProductUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog) { }

  async execute(id: number, input: unknown, branchId: number, actor: { id: number; displayName: string }) {
    const changes = updateProductSchema.parse(input)

    return this.uow.run(async () => {
      const existing = await this.products.findById(id, branchId)
      if (!existing) throw new DomainNotFoundError('ไม่พบสินค้า')

      const updated = await this.products.update(existing.with(changes), branchId)
      const delta = auditChanges(existing, updated, ['name', 'productType', 'priceSatang', 'costSatang', 'isActive', 'categoryId', 'sku', 'barcode'])
      if (delta.changed) await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'product.update',
        entityType: 'product',
        entityId: String(id),
        summary: 'แก้ไขสินค้า',
        before: delta.before,
        after: delta.after,
      }))
      return updated
    })
  }
}
