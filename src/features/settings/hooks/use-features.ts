import { useSettings } from './use-settings'

/** Which optional parts of the system the shop shows. They only hide screens; nothing is blocked or deleted. */
export function useFeatures(): { tables: boolean; modifiers: boolean } {
  const { tablesEnabled, modifiersEnabled } = useSettings()
  return { tables: tablesEnabled, modifiers: modifiersEnabled }
}
