import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { ProductEntity } from '../../../../domains/product.domain'
import { idParams } from '../../../../shared/models'
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

    return new Elysia({ name: 'catalog.products', prefix: '/products' })
      .use(auth)
      .get('/', async ({ query }) => (await this.listProducts.execute(query)).map(toResponse), {
        auth: true,
        query: productSchemas.listQuery,
        response: t.Array(productSchemas.product),
        detail: { summary: 'ค้นหาสินค้าด้วยชื่อ SKU หรือบาร์โค้ด' },
      })
      .get('/:id', async ({ params }) => toResponse(await this.getProduct.execute(params.id)), {
        auth: true,
        params: idParams,
        response: productSchemas.product,
        detail: { summary: 'รายละเอียดสินค้า' },
      })
      .post('/', async ({ body }) => toResponse(await this.createProduct.execute(body)), {
        auth: ['owner'],
        body: productSchemas.create,
        response: productSchemas.product,
        detail: { summary: 'เพิ่มสินค้า' },
      })
      .patch('/:id', async ({ params, body }) => toResponse(await this.updateProduct.execute(params.id, body)), {
        auth: ['owner'],
        params: idParams,
        body: productSchemas.update,
        response: productSchemas.product,
        detail: { summary: 'แก้ไขสินค้า (สต็อกแก้ผ่าน inventory เท่านั้น)' },
      })
      .put(
        '/:id/image',
        async ({ params, body }) => toResponse(await this.setProductImage.execute(params.id, body.file)),
        {
          auth: ['owner'],
          params: idParams,
          body: productSchemas.image,
          response: productSchemas.product,
          detail: { summary: 'อัปโหลดรูปสินค้า (JPEG, PNG, WebP ไม่เกิน 5 MB) แทนรูปเดิม' },
        },
      )
      .delete('/:id/image', async ({ params }) => toResponse(await this.removeProductImage.execute(params.id)), {
        auth: ['owner'],
        params: idParams,
        response: productSchemas.product,
        detail: { summary: 'ลบรูปสินค้า' },
      })
  }
}
