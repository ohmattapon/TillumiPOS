import { Elysia } from 'elysia'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { resolveCheckoutMode } from '../libs/checkout-mode'
import { container } from 'tsyringe'
import type { ICheckoutPolicy } from './shared/ports/checkout-policy.port'
import { TOKENS } from './tokens'

const retiredV1MoneyCommand = /^\/api\/v1\/(?:sales\/?|sales\/\d+\/void|orders\/\d+\/pay|payments\/qr\/?|payments\/qr\/\d+\/cancel)$/

/** Once shift checkout is activated, old v1 money commands cannot bypass shift validation. */
export const legacyMoneyPolicy = new Elysia({ name: 'legacy-money-policy' }).onBeforeHandle(
  { as: 'global' },
  async ({ request }) => {
    const url = new URL(request.url)
    if (request.method !== 'POST' || !retiredV1MoneyCommand.test(url.pathname)) return
    const shiftsEnabled = resolveCheckoutMode() === 'shifts' || await container.resolve<ICheckoutPolicy>(TOKENS.CheckoutPolicy).isShiftsEnabled()
    if (shiftsEnabled)
      throw new DomainNotFoundError('คำสั่งชำระเงิน v1 เลิกให้บริการแล้ว กรุณาใช้ API v2', 'API_VERSION_RETIRED')
  },
)
