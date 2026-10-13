import { Elysia, t } from 'elysia'
import { idParams } from '../../../shared/models'
import { auth } from '../../../shared/plugins/auth'
import { ProductModel } from './model'
import { ProductsService } from './service'

export const products = new Elysia({ name: 'catalog.products', prefix: '/products' })
  .use(auth)
  .get('/', ({ query }) => ProductsService.list(query), {
    auth: true,
    query: ProductModel.listQuery,
    response: t.Array(ProductModel.product),
    detail: { summary: 'ค้นหาสินค้าด้วยชื่อ SKU หรือบาร์โค้ด' },
  })
  .get('/:id', ({ params }) => ProductsService.getById(params.id), {
    auth: true,
    params: idParams,
    response: ProductModel.product,
    detail: { summary: 'รายละเอียดสินค้า' },
  })
  .post('/', ({ body }) => ProductsService.create(body), {
    auth: ['owner'],
    body: ProductModel.create,
    response: ProductModel.product,
    detail: { summary: 'เพิ่มสินค้า' },
  })
  .patch('/:id', ({ params, body }) => ProductsService.update(params.id, body), {
    auth: ['owner'],
    params: idParams,
    body: ProductModel.update,
    response: ProductModel.product,
    detail: { summary: 'แก้ไขสินค้า (สต็อกแก้ผ่าน inventory เท่านั้น)' },
  })
  .put('/:id/image', ({ params, body }) => ProductsService.setImage(params.id, body.file), {
    auth: ['owner'],
    params: idParams,
    body: ProductModel.image,
    response: ProductModel.product,
    detail: { summary: 'อัปโหลดรูปสินค้า (JPEG, PNG, WebP ไม่เกิน 5 MB) แทนรูปเดิม' },
  })
  .delete('/:id/image', ({ params }) => ProductsService.removeImage(params.id), {
    auth: ['owner'],
    params: idParams,
    response: ProductModel.product,
    detail: { summary: 'ลบรูปสินค้า' },
  })
