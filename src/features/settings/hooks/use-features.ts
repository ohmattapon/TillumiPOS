import { useSettings } from './use-settings'

/** Which optional parts of the system the shop shows. They only hide screens; nothing is blocked or deleted. */
export function useFeatures(): { tables: boolean; kitchen: boolean; modifiers: boolean } {
  const { tablesEnabled, kitchenEnabled, modifiersEnabled } = useSettings()
  return { tables: tablesEnabled, kitchen: kitchenEnabled, modifiers: modifiersEnabled }
}
