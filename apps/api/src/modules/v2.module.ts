import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { RegisterElysiaController } from './shifts/adapters/controllers/register.controller'
import { ShiftElysiaController } from './shifts/adapters/controllers/shift.controller'
import { SaleV2ElysiaController } from './sales/adapters/controllers/sale-v2.controller'
import { PayOrderV2ElysiaController } from './orders/adapters/controllers/pay-order-v2.controller'
import { CapabilitiesV2Controller } from './capabilities-v2.controller'
import { QrPaymentV2ElysiaController } from './qr-payments/adapters/controllers/qr-payment-v2.controller'

const registers = container.resolve(RegisterElysiaController)
const shifts = container.resolve(ShiftElysiaController)
const sales = container.resolve(SaleV2ElysiaController)
const orders = container.resolve(PayOrderV2ElysiaController)
const capabilities = container.resolve(CapabilitiesV2Controller)
const qrPayments = container.resolve(QrPaymentV2ElysiaController)

export const v2Module = new Elysia({ name: 'api.v2', prefix: '/api/v2' })
  .use(registers.getRoutes())
  .use(shifts.getRoutes())
  .use(sales.getRoutes())
  .use(orders.getRoutes())
  .use(qrPayments.getRoutes())
  .use(capabilities.getRoutes())
