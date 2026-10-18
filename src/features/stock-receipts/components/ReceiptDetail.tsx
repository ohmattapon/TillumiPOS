import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/DataTable'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/features/settings'
import { stockReceiptQuery } from '../api'

export function ReceiptDetail({ actorId, id }: { actorId: number; id: number }) {
  const { t } = useTranslation('stockReceipts')
  const { date } = useFormat()
  const result = useQuery(stockReceiptQuery(actorId, id))
  const receipt = result.data
  return <Panel title={t('receipt', { id })} description={receipt ? `${date.dateTime(receipt.createdAt)} · ${receipt.receivedByName}` : undefined}>
    {result.error ? <div role="alert" className="space-y-2 p-4 text-destructive"><p>{result.error.message}</p><Button className="h-11" variant="outline" onClick={() => void result.refetch()}>{t('retry')}</Button></div> : <DataTable
      rows={receipt?.items ?? []} rowKey={(item) => item.productId} isPending={result.isPending} empty={t('noItems')}
      columns={[
        { id: 'name', header: t('product'), priority: 'primary', cell: (item) => item.name },
        { id: 'sku', header: t('sku'), priority: 'secondary', cell: (item) => item.sku },
        { id: 'qty', header: t('qty'), priority: 'secondary', align: 'right', cell: (item) => <span><span className="sm:hidden">{t('qty')}: </span>{item.quantity}</span> },
        { id: 'balance', header: t('balance'), priority: 'secondary', align: 'right', cell: (item) => <span><span className="sm:hidden">{t('balance')}: </span>{item.balanceAfter}</span> },
      ]} />}
    {receipt?.note && <p className="whitespace-pre-wrap break-words border-t p-4 text-sm">{t('note')}: {receipt.note}</p>}
  </Panel>
}
