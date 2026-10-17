import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { ProductEntity } from '../../../../domains/product.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { CreateProductUseCase } from '../../applications/usecases/create-product.usecase'
import { GetProductUseCase } from '../../applications/usecases/get-product.usecase'
import { ListProductsUseCase } from '../../applications/usecases/list-products.usecase'
import { RemoveProductImageUseCase } from '../../applications/usecases/remove-product-image.usecase'
import { SetProductImageUseCase } from '../../applications/usecases/set-product-image.usecase'
import { UpdateProductUseCase } from '../../applications/usecases/update-product.usecase'
import { toProductResponse } from './product.presenter'
import { productSchemas } from './schemas/product.schema'

@injectable()
export class ProductElysiaController {
  constructor(
    @inject(ListProductsUseCase) private readonly listProducts: ListProductsUseCase,
    @inject(GetProductUseCase) private readonly getProduct: GetProductUseCase,
    @inject(CreateProductUseCase) private readonly createProduct: CreateProductUseCase,
    @inject(UpdateProductUseCase) private readonly updateProduct: UpdateProductUseCase,
    @inject(SetProductImageUseCase) private readonly setProductImage: SetProductImageUseCase,
    @inject(RemoveProductImageUseCase) private readonly removeProductImage: RemoveProductImageUseCase,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  getRoutes() {
    const toResponse = (product: ProductEntity) => toProductResponse(product, this.media)

    // The catalogue is shared by every branch; only the stock level in a response is the branch's own.
    return new Elysia({ name: 'catalog.products', prefix: '/products' })
      .use(auth)
      .get(
        '/',
        async ({ query, branch }) => {
          const { items, total } = await this.listProducts.execute(query, (await branch()).id)
          return { items: items.map(toResponse), total }
        },
        {
          auth: true,
          query: productSchemas.listQuery,
          response: page(productSchemas.product),
          detail: { summary: 'ค้นหาสินค้าด้วยชื่อ SKU หรือบาร์โค้ด พร้อมสต็อกของสาขาที่ทำงานอยู่' },
        },
      )
      .get(
        '/:id',
        async ({ params, branch }) => toResponse(await this.getProduct.execute(params.id, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: productSchemas.product,
          detail: { summary: 'รายละเอียดสินค้า' },
        },
      )
      .post(
        '/',
        async ({ body, branch, user }) => toResponse(await this.createProduct.execute(body, (await branch()).id, user)),
        {
          auth: { can: 'products.write' },
          body: productSchemas.create,
          response: productSchemas.product,
          detail: { summary: 'เพิ่มสินค้า' },
        },
      )
      .patch(
        '/:id',
        async ({ params, body, branch, user }) =>
          toResponse(await this.updateProduct.execute(params.id, body, (await branch()).id, user)),
        {
          auth: { can: 'products.write' },
          params: idParams,
          body: productSchemas.update,
          response: productSchemas.product,
          detail: { summary: 'แก้ไขสินค้า (สต็อกแก้ผ่าน inventory เท่านั้น)' },
        },
      )
      .put(
        '/:id/image',
        async ({ params, body, branch }) =>
          toResponse(await this.setProductImage.execute(params.id, body.file, (await branch()).id)),
        {
          auth: { can: 'products.write' },
          params: idParams,
          body: productSchemas.image,
          response: productSchemas.product,
          detail: { summary: 'อัปโหลดรูปสินค้า (JPEG, PNG, WebP ไม่เกิน 5 MB) แทนรูปเดิม' },
        },
      )
      .delete(
        '/:id/image',
        async ({ params, branch }) =>
          toResponse(await this.removeProductImage.execute(params.id, (await branch()).id)),
        {
          auth: { can: 'products.write' },
          params: idParams,
          response: productSchemas.product,
          detail: { summary: 'ลบรูปสินค้า' },
        },
      )
  }
}
