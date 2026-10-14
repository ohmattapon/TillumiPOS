export type { Order } from '@pos/api/types'
export {
  openOrdersQuery,
  orderKeys,
  orderQuery,
  useAddOrderItem,
  useCancelOrder,
  useOpenOrder,
  usePayOrder,
  useRemoveOrderLine,
  useSetOrderLineQuantity,
} from './api'
