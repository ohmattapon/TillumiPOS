/**
 * What to send when the note field is left: the trimmed text, `null` to clear the note,
 * or `undefined` when the note is not changed and nothing should be sent.
 */
export function noteToSave(draft: string, current: string | null): string | null | undefined {
  const next = draft.trim()
  if (next === (current ?? '')) return undefined
  return next === '' ? null : next
}
