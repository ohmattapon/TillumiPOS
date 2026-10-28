import type { Page } from '../../../../domains/page'
import type { PromotionEntity } from '../../../../domains/promotion.domain'

export interface PromotionListQuery {
  isActive?: boolean
  limit: number
  offset: number
}

export interface IPromotionRepository {
  /** One page ordered by name, with the total that match. */
  find(query: PromotionListQuery): Promise<Page<PromotionEntity>>
  findById(id: number): Promise<PromotionEntity | null>
  /** Like findById, but row-locks the promotion until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<PromotionEntity | null>
  /** Throws PROMOTION_NAME_TAKEN when another promotion has the name (ignoring case). */
  create(entity: PromotionEntity): Promise<PromotionEntity>
  update(entity: PromotionEntity): Promise<PromotionEntity>
  /** The only writer of the display image key. Throws PROMOTION_NOT_FOUND when the id is unknown. */
  setImageKey(id: number, imageKey: string | null): Promise<PromotionEntity>
}

export const promotionRepositoryToken = Symbol('IPromotionRepository').toString()
