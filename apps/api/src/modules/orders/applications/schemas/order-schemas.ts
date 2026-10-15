import { z } from 'zod'
import { ORDER_STATUSES } from '../../../../domains/order.domain'
import { PAYMENT_METHODS } from '../../../../domains/sale.domain'

const productId = z.number().int().positive()
const quantity = z.number().int().min(1)
const label = z.string().max(100).nullable()
const options = z.array(z.number().int().positive()).max(40)

export const setOrderMemberSchema = z.object({ memberId: z.number().int().positive().nullable() })

export const openOrderSchema = z.object({
  memberId: z.number().int().positive().nullable().optional(),
  label: label.optional(),
  tableId: z.number().int().positive().nullable().optional(),
  items: z.array(z.object({ productId, quantity, options: options.optional() })).max(100).optional(),
})

export const updateOrderSchema = z.object({ label })

export const moveOrderSchema = z.object({ tableId: z.number().int().positive().nullable() })

export const mergeOrdersSchema = z.object({ sourceOrderId: z.number().int().positive() })

export const splitOrderSchema = z.object({
  lines: z
    .array(z.object({ lineId: z.number().int().positive(), quantity: z.number().int().min(1) }))
    .min(1)
    .max(100),
  label: z.string().max(100).nullable().optional(),
})

export const addOrderItemSchema = z.object({ productId, quantity, options: options.optional() })

export const setOrderItemQuantitySchema = z.object({ quantity })

export const cancelOrderSchema = z.object({ reason: z.string().min(1).max(500) })

export const payOrderSchema = z.object({
  discountSatang: z.number().int().min(0).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amountSatang: z.number().int().min(1),
        qrPaymentId: z.number().int().positive().optional(),
      }),
    )
    .min(1),
})

export const listOrdersSchema = z.object({
  tableId: z.number().int().positive().optional(),
  excludeId: z.number().int().positive().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})

// The domain trims the note and refuses more than 200 characters after trimming.
export const setOrderLineNoteSchema = z.object({ note: z.string().max(500).nullable() })
