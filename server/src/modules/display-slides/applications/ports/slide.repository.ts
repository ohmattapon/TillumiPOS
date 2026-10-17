import type { SlideEntity } from '../../../../domains/slide.domain'

export interface ISlideRepository {
  /** Every slide, active or not, ordered by sort order then id. */
  findAll(): Promise<SlideEntity[]>
  /** Only visible slides, ordered by sort order then id. */
  findActive(): Promise<SlideEntity[]>
  findById(id: number): Promise<SlideEntity | null>
  /** Stores a new slide and returns it with its assigned id. Throws DomainConflictError on a duplicate image key. */
  create(entity: SlideEntity): Promise<SlideEntity>
  /** Overwrites the stored slide that has the entity's id. */
  update(entity: SlideEntity): Promise<SlideEntity>
  /** Removes the stored slide and returns it. Throws DomainNotFoundError when the id is unknown. */
  delete(id: number): Promise<SlideEntity>
}

const slideRepositoryTokenSymbol: unique symbol = Symbol('ISlideRepository')
export const slideRepositoryToken = slideRepositoryTokenSymbol.toString()
