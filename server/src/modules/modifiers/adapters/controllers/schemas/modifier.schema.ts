import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const option = t.Object({
  id: t.Integer(),
  groupId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
  costSatang: t.Integer(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
})

const group = t.Object({
  id: t.Integer(),
  name: t.String(),
  required: t.Boolean(),
  maxSelections: t.Integer(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
  options: t.Array(option),
  // The products this group is offered on.
  productIds: t.Array(t.Integer()),
})

export const modifierSchemas = {
  option,
  group,
  createGroup: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    required: t.Optional(t.Boolean()),
    maxSelections: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateGroup: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      required: t.Boolean(),
      maxSelections: t.Integer({ minimum: 1, maximum: 20 }),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
  createOption: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    priceSatang: t.Optional(satang()),
    costSatang: t.Optional(satang()),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateOption: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      priceSatang: satang(),
      costSatang: satang(),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
  productGroups: t.Object({ groupIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 50 }) }),
}

export type ModifierGroupResponse = typeof modifierSchemas.group.static
export type ModifierOptionResponse = typeof modifierSchemas.option.static
