export type { Order } from '@pos/api/types'
export {
  openOrdersQuery,
  orderKeys,
  orderQuery,
  useAddOrderItem,
  useCancelOrder,
  useMergeOrders,
  useMoveOrder,
  useOpenOrder,
  usePayOrder,
  useRemoveOrderLine,
  useSetOrderLineNote,
  useSetOrderLineQuantity,
  useSplitOrder,
} from './api'
