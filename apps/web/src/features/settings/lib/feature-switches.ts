import type { HomeView } from '@pos/api/shop-settings'

/** Switches tables on or off. The floor plan cannot be home without tables, so turning them off sends home to the till. */
export function withTablesSwitch<T extends { tablesEnabled: boolean; homeView: HomeView }>(form: T, tablesEnabled: boolean): T {
  return { ...form, tablesEnabled, homeView: tablesEnabled ? form.homeView : 'till' }
}
