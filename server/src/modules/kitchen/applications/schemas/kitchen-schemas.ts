import { z } from 'zod'

const stationName = z.string().trim().min(1).max(50)

export const createKitchenStationSchema = z.object({
  name: stationName,
  sortOrder: z.number().int().optional(),
})

export const updateKitchenStationSchema = z
  .object({
    name: stationName,
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .partial()

export const setCategoryStationSchema = z.object({
  stationId: z.number().int().positive().nullable(),
})

export const kitchenBoardQuerySchema = z.object({
  stationId: z.number().int().positive(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})
