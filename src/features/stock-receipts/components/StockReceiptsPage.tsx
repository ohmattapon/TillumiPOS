import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { meQuery } from '@/features/auth'
import { useFormat } from '@/features/settings'
import { stockReceiptsQuery } from '../api'
import { ReceiptDetail } from './ReceiptDetail'

export function StockReceiptsPage() {
  const me = useQuery(meQuery)
  return me.data ? <History key={me.data.id} actorId={me.data.id} /> : null
}
function History({ actorId }: { actorId: number }) {
  const { t } = useTranslation('stockReceipts'), { date } = useFormat()
  const [page, setPage] = useState(0), [selected, setSelected] = useState<number | null>(null)
  const result = useQuery(stockReceiptsQuery(actorId, page * 25))
  return <>
    <PageHeader title={t('title')} description={t('description')}><Button className="h-11" asChild><Link to="/stock-receipts/new">{t('new')}</Link></Button></PageHeader>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <Panel title={t('history')}>
        {result.error ? <div role="alert" className="space-y-2 p-4 text-destructive"><p>{result.error.message}</p><Button variant="outline" className="h-11" onClick={() => void result.refetch()}>{t('retry')}</Button></div> : <DataTable
          rows={result.data?.items ?? []} rowKey={(row) => row.id} isPending={result.isPending} empty={t('empty')}
          rowLabel={(row) => t('receipt', { id: row.id })} onSelect={(row) => setSelected(row.id)}
          columns={[
            { id: 'id', header: t('title'), priority: 'primary', cell: (row) => t('receipt', { id: row.id }) },
            { id: 'time', header: t('time'), priority: 'secondary', cell: (row) => date.dateTime(row.createdAt) },
            { id: 'actor', header: t('receiver'), priority: 'secondary', cell: (row) => row.receivedByName },
            { id: 'items', header: t('items'), priority: 'wide-only', align: 'right', cell: (row) => row.items.length },
          ]} />}
        <PaginationBar page={page} pageSize={25} total={result.data?.total} isLoading={result.isFetching} onPageChange={(next) => { setPage(next); setSelected(null) }} />
      </Panel>
      {selected !== null && <ReceiptDetail actorId={actorId} id={selected} />}
    </div>
  </>
}
