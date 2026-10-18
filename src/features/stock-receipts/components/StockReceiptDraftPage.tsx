import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { meQuery } from '@/features/auth'
import { productQuery, productsQuery } from '@/features/products'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ApiError } from '@/lib/api'
import { useReceiveStock } from '../api'
import { ReceiptDraftStore } from '../lib/draft'
import { ReceiptDetail } from './ReceiptDetail'
import { ReceiptQuantityInput } from './ReceiptQuantityInput'
import { newIdempotencyKey } from '@/lib/idempotency-key'

export function StockReceiptDraftPage() {
  const me = useQuery(meQuery)
  return me.data ? <Draft key={me.data.id} actorId={me.data.id} /> : null
}

function Draft({ actorId }: { actorId: number }) {
  const { t } = useTranslation('stockReceipts')
  const [store] = useState(() => {
    try { return new ReceiptDraftStore(actorId, window.localStorage, newIdempotencyKey) }
    catch { return null }
  })
  const [draft, setDraft] = useState(() => store?.value)
  const [blocked, setBlocked] = useState(!store)
  const [message, setMessage] = useState('')
  const [invalidIds, setInvalidIds] = useState<number[]>([])
  const [unfinishedQuantities, setUnfinishedQuantities] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const term = useDebouncedValue(search.trim())
  const products = useQuery(productsQuery({ q: term, includeInactive: true, limit: 20, offset: 0 }))
  const details = useQueries({ queries: (draft?.items ?? []).map((item) => productQuery(item.productId)) })
  const mutation = useReceiveStock(actorId)
  const editable = !blocked && draft?.status === 'draft'

  const change = (operation: (journal: ReceiptDraftStore) => void) => {
    if (!store || blocked) return
    // User input must reach durable storage before its event returns: a reload may happen
    // immediately afterwards. Queueing a per-keystroke Web Lock can lose that last edit.
    try { operation(store); setDraft(store.value); setMessage(''); setInvalidIds([]) }
    catch { setBlocked(true) }
  }

  useEffect(() => {
    const listen = (event: StorageEvent) => {
      if (event.key === `pos.stock-receipt.${actorId}` || event.key === null) setBlocked(true)
    }
    window.addEventListener('storage', listen)
    return () => window.removeEventListener('storage', listen)
  }, [actorId])

  useEffect(() => {
    const preselected = Number(params.get('productId'))
    if (!Number.isSafeInteger(preselected) || preselected < 1 || !store || blocked || store.value.status !== 'draft') return
    try {
      // Synchronize the durable journal with a product selected on another route.
      if (!store.value.items.some((item) => item.productId === preselected)) store.add(preselected)
      // oxlint-disable-next-line react/set-state-in-effect -- The URL preselection updates external durable storage.
      setDraft(store.value)
      setParams({}, { replace: true })
    } catch { setBlocked(true) }
  }, [params, setParams, store, blocked])

  const performSubmission = async () => {
    if (!store || blocked || mutation.isPending || store.value.items.some((item) => unfinishedQuantities.includes(item.productId))) return
    let submission
    try { submission = store.begin(); setDraft(store.value); setMessage(''); setInvalidIds([]) }
    catch { setBlocked(true); return }
    try {
      const receipt = await mutation.mutateAsync(submission)
      try { store.confirm(receipt.id); setDraft(store.value) }
      catch { setBlocked(true) }
    } catch (error) {
      try {
        // Only a definitive application rejection is safe to edit. Auth and transport outcomes
        // might arrive after a prior successful attempt, so retain its exact request.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ['STOCK_RECEIPT_INVALID_ITEMS', 'VALIDATION', 'IDEMPOTENCY_KEY_REQUIRED'].includes(error.code)) store.reject()
        else store.uncertain()
        setDraft(store.value)
        setMessage(error instanceof Error ? error.message : t('failed'))
        if (error instanceof ApiError && error.code === 'STOCK_RECEIPT_INVALID_ITEMS')
          setInvalidIds(String(error.params?.productIds ?? '').split(',').map(Number))
      } catch { setBlocked(true) }
    }
  }

  const submit = async () => {
    // Serialize submissions across tabs; journal writes reject stale drafts independently.
    if (navigator.locks) await navigator.locks.request(`pos.stock-receipt.${actorId}`, performSubmission)
    else await performSubmission()
  }

  const rows = (draft?.items ?? []).map((item, index) => ({ ...item, product: details[index]?.data, error: details[index]?.error, pending: details[index]?.isPending }))
  return <>
    <PageHeader title={t('draft')} description={t('description')}><Button variant="outline" className="h-11" asChild><Link to="/stock-receipts">{t('history')}</Link></Button></PageHeader>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {blocked && <div role="alert" className="space-y-3 rounded-md border border-destructive p-4 text-sm"><p>{t('storageError')}</p><Button className="h-11" variant="outline" onClick={() => window.location.reload()}>{t('reload')}</Button></div>}
      {!blocked && draft?.status === 'confirmed' && draft.receiptId ? <>
        <p role="status" className="text-sm text-success">{t('confirmed')}</p>
        <ReceiptDetail actorId={actorId} id={draft.receiptId} />
        <Button className="h-11" onClick={() => change((journal) => journal.newDraft())}>{t('new')}</Button>
      </> : draft && <>
        {(draft.status === 'unknown' || (draft.status === 'submitting' && !mutation.isPending)) && <p role="alert" className="rounded-md border border-warning p-4 text-sm">{t('unknown')}</p>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <Panel title={t('search')}>
          <div className="space-y-3 p-4">
            <Label htmlFor="receipt-search">{t('search')}</Label>
            <Input className="h-11" id="receipt-search" value={search} disabled={!editable} onChange={(event) => setSearch(event.target.value)} />
            <p className="text-xs text-muted-foreground">{t('limit')}</p>
            {products.error && <div role="alert" className="text-sm text-destructive"><p>{products.error.message}</p><Button className="h-11" variant="outline" onClick={() => void products.refetch()}>{t('retry')}</Button></div>}
          </div>
          {!products.error && <DataTable rows={term === search.trim() ? products.data?.items ?? [] : []} rowKey={(product) => product.id} isPending={products.isPending || term !== search.trim()} empty={t('noProducts')} columns={[
            { id: 'name', header: t('product'), priority: 'primary', cell: (product) => product.name },
            { id: 'sku', header: t('sku'), priority: 'secondary', cell: (product) => product.sku },
          ]} actions={(product) => <Button className="h-11" variant="outline" aria-label={t('add', { name: product.name })} disabled={!editable || !product.trackStock || (draft.items.length >= 100 && !draft.items.some((item) => item.productId === product.id))} title={!product.trackStock ? t('untracked') : undefined} onClick={() => change((journal) => journal.add(product.id))}>{t('addAction')}</Button>} />}
        </Panel>
        <Panel title={t('items')} description={t('rowCount', { count: rows.length })}>
          <DataTable rows={rows} rowKey={(row) => row.productId} empty={t('noItems')} columns={[
            { id: 'name', header: t('product'), priority: 'primary', cell: (row) => <div><span>{row.product?.name ?? t('missing', { id: row.productId })}</span>{invalidIds.includes(row.productId) && <p className="text-destructive">{t('invalid')}</p>}{row.error && <p role="alert" className="text-destructive">{row.error.message}<Button variant="outline" className="h-11" onClick={() => void details[rows.indexOf(row)]?.refetch()}>{t('retry')}</Button></p>}</div> },
            { id: 'sku', header: t('sku'), priority: 'secondary', cell: (row) => row.product?.sku },
            { id: 'qty', header: t('qty'), priority: 'secondary', cell: (row) => <ReceiptQuantityInput quantity={row.quantity} label={t('quantity', { name: row.product?.name ?? t('missing', { id: row.productId }) })} disabled={!editable} onQuantity={(quantity) => change((journal) => journal.quantity(row.productId, quantity))} onInvalid={(invalid) => setUnfinishedQuantities((ids) => invalid ? [...new Set([...ids, row.productId])] : ids.filter((id) => id !== row.productId))} /> },
          ]} actions={(row) => <Button variant="ghost" className="h-11" disabled={!editable} aria-label={t('remove', { name: row.product?.name ?? t('missing', { id: row.productId }) })} onClick={() => change((journal) => journal.remove(row.productId))}>{t('removeAction')}</Button>} />
          <div className="space-y-2 border-t p-4"><Label htmlFor="receipt-note">{t('note')}</Label><textarea id="receipt-note" className="min-h-22 w-full rounded-md border bg-background p-3 text-sm" maxLength={500} value={draft.note} disabled={!editable} onChange={(event) => { const note = event.target.value; change((journal) => journal.edit({ note })) }} /></div>
        </Panel>
        <div className="flex flex-wrap gap-3">
          <Button className="h-11" disabled={blocked || mutation.isPending || draft.items.some((item) => unfinishedQuantities.includes(item.productId)) || draft.items.length === 0 || (editable && rows.some((row) => row.pending || row.error))} onClick={() => void submit()}>{mutation.isPending ? t('working') : editable ? t('submit') : t('retrySubmission')}</Button>
          {editable && <Button variant="outline" className="h-11" onClick={() => { if (window.confirm(`${t('discardTitle')}\n${t('discardDescription')}`)) change((journal) => journal.newDraft()) }}>{t('discard')}</Button>}
        </div>
      </>}
    </div>
  </>
}
