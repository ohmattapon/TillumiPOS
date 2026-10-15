import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { ModifierGroupView } from '../../applications/ports/modifier.repository'
import { CreateModifierGroupUseCase } from '../../applications/usecases/create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from '../../applications/usecases/create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from '../../applications/usecases/list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from '../../applications/usecases/set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from '../../applications/usecases/update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from '../../applications/usecases/update-modifier-option.usecase'
import { modifierSchemas, type ModifierGroupResponse } from './schemas/modifier.schema'

// Entities never leave the API as-is: the response shape is a contract of its own.
const toGroupResponse = ({ group, options, productIds }: ModifierGroupView): ModifierGroupResponse => ({
  ...group.toSnapshot(),
  options: options.map((option) => option.toSnapshot()),
  productIds,
})

@injectable()
export class ModifierElysiaController {
  constructor(
    @inject(ListModifierGroupsUseCase) private readonly listGroups: ListModifierGroupsUseCase,
    @inject(CreateModifierGroupUseCase) private readonly createGroup: CreateModifierGroupUseCase,
    @inject(UpdateModifierGroupUseCase) private readonly updateGroup: UpdateModifierGroupUseCase,
    @inject(CreateModifierOptionUseCase) private readonly createOption: CreateModifierOptionUseCase,
    @inject(UpdateModifierOptionUseCase) private readonly updateOption: UpdateModifierOptionUseCase,
    @inject(SetProductModifierGroupsUseCase) private readonly setProductGroups: SetProductModifierGroupsUseCase,
  ) {}

  /** Mounted under /catalog, beside categories and products. */
  getRoutes() {
    return new Elysia({ name: 'catalog.modifiers' })
      .use(auth)
      .get(
        '/modifier-groups',
        async () => {
          const items = (await this.listGroups.execute()).map(toGroupResponse)
          return { items, total: items.length }
        },
        {
          auth: true,
          response: page(modifierSchemas.group),
          detail: { summary: 'กลุ่มตัวเลือกพร้อมตัวเลือกและสินค้าที่ใช้' },
        },
      )
      .post('/modifier-groups', async ({ body }) => toGroupResponse(await this.createGroup.execute(body)), {
        auth: ['owner'],
        body: modifierSchemas.createGroup,
        response: modifierSchemas.group,
        detail: { summary: 'เพิ่มกลุ่มตัวเลือก' },
      })
      .patch(
        '/modifier-groups/:id',
        async ({ params, body }) => toGroupResponse(await this.updateGroup.execute(params.id, body)),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.updateGroup,
          response: modifierSchemas.group,
          detail: { summary: 'แก้ไขหรือปิดใช้กลุ่มตัวเลือก' },
        },
      )
      .post(
        '/modifier-groups/:id/options',
        async ({ params, body }) => (await this.createOption.execute(params.id, body)).toSnapshot(),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.createOption,
          response: modifierSchemas.option,
          detail: { summary: 'เพิ่มตัวเลือกในกลุ่ม' },
        },
      )
      .patch(
        '/modifier-options/:id',
        async ({ params, body }) => (await this.updateOption.execute(params.id, body)).toSnapshot(),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.updateOption,
          response: modifierSchemas.option,
          detail: { summary: 'แก้ราคา ต้นทุน หรือปิดใช้ตัวเลือก' },
        },
      )
      .put(
        '/products/:id/modifier-groups',
        async ({ params, body, branch }) => ({
          groupIds: await this.setProductGroups.execute(params.id, body, (await branch()).id),
        }),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.productGroups,
          response: modifierSchemas.productGroups,
          detail: { summary: 'ตั้งกลุ่มตัวเลือกที่สินค้านี้ใช้ (แทนที่ทั้งชุด ตามลำดับที่ส่ง)' },
        },
      )
  }
}
