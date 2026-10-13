import { z } from 'zod'
import { ORDER_STATUSES } from '../../../../domains/order.domain'
import { PAYMENT_METHODS } from '../../../../domains/sale.domain'

const productId = z.number().int().positive()
const quantity = z.number().int().min(1)
const label = z.string().max(100).nullable()

export const openOrderSchema = z.object({
  label: label.optional(),
  items: z.array(z.object({ productId, quantity })).max(100).optional(),
})

export const updateOrderSchema = z.object({ label })

export const addOrderItemSchema = z.object({ productId, quantity })

export const setOrderItemQuantitySchema = z.object({ quantity })

export const cancelOrderSchema = z.object({ reason: z.string().min(1).max(500) })

export const payOrderSchema = z.object({
  discountSatang: z.number().int().min(0).optional(),
  payments: z
    .array(z.object({ method: z.enum(PAYMENT_METHODS), amountSatang: z.number().int().min(1) }))
    .min(1),
})

export const listOrdersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})
