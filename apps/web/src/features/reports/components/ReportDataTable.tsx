import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { tableCell, tableHead } from '@/components/Panel'
import { Button } from '@/components/ui/button'

export function ReportDataTable({ headers, rows, numberFrom = 1 }: {
  headers: string[]; rows: ReactNode[][]; numberFrom?: number
}) {
  const { t } = useTranslation('reports')
  return (
    <div className="max-h-96 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="hover:bg-transparent">
          {headers.map((header, i) => <TableHead key={header} className={`${tableHead} ${i >= numberFrom ? 'text-right' : ''}`}>{header}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((row, i) => <TableRow key={i}>{row.map((cell, j) =>
            <TableCell key={j} className={`${tableCell} ${j >= numberFrom ? 'text-right tabular-nums' : ''}`}>{cell}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={headers.length} className="h-24 text-center text-muted-foreground">{t('empty')}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  )
}
export function ReportPagination({ offset, total, onPage, disabled }: {
  offset: number; total: number; onPage: (offset: number) => void; disabled: boolean
}) {
  const { t } = useTranslation('reports')
  if (total === 0) return null
  return <div className="flex items-center justify-between gap-2 border-t p-3">
    <span className="text-xs text-muted-foreground">{t('page', { from: Math.min(offset + 1, total), to: Math.min(offset + 10, total), total })}</span>
    <div className="flex gap-1">
      <Button size="sm" variant="outline" disabled={disabled || offset === 0} onClick={() => onPage(Math.max(0, offset - 10))}>{t('previous')}</Button>
      <Button size="sm" variant="outline" disabled={disabled || offset + 10 >= total} onClick={() => onPage(offset + 10)}>{t('next')}</Button>
    </div>
  </div>
}
