import type { ReactNode } from 'react'
import { useListPagination } from '@/hooks/use-list-pagination'
import { PaginationBar } from './PaginationBar'

/** Short catalogue lists are read in full for their selectors, but rendered one page at a time. */
export function PaginatedItems<T>({ items, scope, pageSize = 20, children }: {
  items: T[]
  scope: string
  pageSize?: number
  children: (visible: T[]) => ReactNode
}) {
  const paging = useListPagination(scope, pageSize)
  return <>
    {children(items.slice(paging.offset, paging.offset + paging.pageSize))}
    <PaginationBar {...paging} total={items.length} onPageChange={paging.setPage} />
  </>
}
