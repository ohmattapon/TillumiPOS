import { SaleEntity, type SaleEntityProps } from '../../../domains/sale.domain'

export function restoreSaleSnapshot(value: unknown): SaleEntity {
  const snapshot = value as Omit<SaleEntityProps, 'createdAt' | 'voidedAt'> & {
    createdAt: string | Date
    voidedAt: string | Date | null
  }
  return new SaleEntity({
    ...snapshot,
    createdAt: new Date(snapshot.createdAt),
    voidedAt: snapshot.voidedAt === null ? null : new Date(snapshot.voidedAt),
  })
}
