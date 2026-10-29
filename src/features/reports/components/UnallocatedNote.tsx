import { useTranslation } from 'react-i18next'

/** Old bills have no per-line share until the update step fills them in, so item and category figures can differ from the overview. */
export function UnallocatedNote({ lines, format }: { lines: number; format: (value: number) => string }) {
  const { t } = useTranslation('reports')
  if (lines <= 0) return null
  return <p role="status" className="rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
    {t('unallocatedLines', { count: lines, formatted: format(lines) })}
  </p>
}
