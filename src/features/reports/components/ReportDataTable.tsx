import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/DataTable'
import type { Column } from '@/lib/data-table'

interface ReportRow {
  key: number
  cells: ReactNode[]
}

/** Adapter บางๆ: ตารางรายงาน (headers + แถวข้อความ) บน DataTable กลาง */
export function ReportDataTable({ headers, rows, numberFrom = 1 }: {
  headers: string[]; rows: ReactNode[][]; numberFrom?: number
}) {
  const { t } = useTranslation('reports')
  const columns: Column<ReportRow>[] = headers.map((header, index) => ({
    id: `col-${index}`,
    header,
    priority: index === 0 ? 'primary' : 'secondary',
    align: index >= numberFrom ? 'right' : undefined,
    cell: (row) => row.cells[index],
  }))
  const tableRows: ReportRow[] = rows.map((cells, key) => ({ key, cells }))
  return (
    <div className="max-h-96 overflow-y-auto">
      <DataTable columns={columns} rows={tableRows} rowKey={(row) => row.key} empty={t('empty')} />
    </div>
  )
}
