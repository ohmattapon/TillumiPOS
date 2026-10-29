import { inject, injectable } from 'tsyringe'
import type { IReportCategoryNames } from '../../sales/applications/ports/report-category-names.port'
import { categoryRepositoryToken, type ICategoryRepository } from '../applications/ports/category.repository'

/**
 * Answers the sales module's report category names port from the category list, active or not.
 * Provider side: the port is owned by sales, implemented and bound here.
 */
@injectable()
export class ReportCategoryNamesAdapter implements IReportCategoryNames {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  async namesFor(ids: readonly number[]): Promise<Map<number, string>> {
    const wanted = new Set(ids)
    return new Map((await this.categories.findAll()).filter((category) => wanted.has(category.id)).map((category) => [category.id, category.name]))
  }
}
