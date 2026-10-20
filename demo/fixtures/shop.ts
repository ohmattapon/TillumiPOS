import type { Branch, Member, ShopSettings, User } from '@pos/api/types'
import type { authSchemas } from '../../server/src/modules/auth/adapters/controllers/schemas/auth.schema'
import type { PromotionResponse } from '../../server/src/modules/promotions/adapters/controllers/schemas/promotion.schema'
import type { shiftHttpSchemas } from '../../server/src/modules/shifts/adapters/controllers/schemas/shift.schema'
import { PERMISSIONS } from '@pos/api/permissions'

export type DemoMe = typeof authSchemas.me.static
export type DemoRegister = typeof shiftHttpSchemas.register.static
export type DemoShift = typeof shiftHttpSchemas.shift.static

// The shop: VAT-included shelf prices, static PromptPay QR, printer off
// (printing is the browser's own print/PDF; there is no printer API to mock).
export const settings: ShopSettings = {
  shopName: 'ร้านกาแฟบ้านสวน',
  taxId: '0123456789012',
  address: '123 ถนนสุขุมวิท กรุงเทพฯ',
  phone: '021234567',
  currency: 'THB',
  vatMode: 'inclusive',
  vatRateBp: 700,
  timeZone: 'Asia/Bangkok',
  locale: 'th',
  receiptPaperMm: 80,
  receiptFooter: 'ขอบคุณที่ใช้บริการ โอกาสหน้าเชิญใหม่',
  homeView: 'till',
  tablesEnabled: true,
  modifiersEnabled: true,
  promptpayMode: 'static',
  promptpayTarget: '0812345678',
}

export const branch: Branch = {
  id: 1,
  code: 'MAIN',
  name: 'สาขาหลัก',
  address: '123 ถนนสุขุมวิท กรุงเทพฯ',
  phone: '021234567',
  isActive: true,
}

const ownerUser: User = {
  id: 1,
  username: 'owner',
  displayName: 'เจ้าของร้าน',
  role: 'owner',
  roleId: 1,
  branchId: 1,
  isActive: true,
  hasPin: false,
}

// Any credentials sign in as this owner; the role alone grants every permission.
export const me: DemoMe = { ...ownerUser, roleName: 'เจ้าของร้าน', permissions: [...PERMISSIONS] }

export const loginUser: User = { ...ownerUser }

export const switchUsers = {
  items: [{ id: 1, displayName: 'เจ้าของร้าน' }],
  total: 1,
}

function member(id: number, code: string, name: string, phone: string, isActive: boolean): Member {
  const at = new Date('2026-01-05T10:00:00+07:00')
  return { id, code, name, phone, isActive, createdAt: at, updatedAt: at }
}

export const members: Member[] = [
  member(1, 'M-0001', 'คุณสมชาย', '0811111111', true),
  member(2, 'M-0002', 'คุณมาลี', '0822222222', true),
  member(3, 'M-0003', 'คุณวิชัย', '0833333333', false),
]

// Simple whole-bill promotions with no date or time limits, so they always run.
export const promotions: PromotionResponse[] = [
  {
    id: 1,
    name: 'ลด 10% บิล 100 บาทขึ้นไป',
    kind: 'percent',
    value: 1000,
    maxDiscountSatang: 5000,
    minSubtotalSatang: 10000,
    startsOn: null,
    endsOn: null,
    weekdays: null,
    windowStartMinute: null,
    windowEndMinute: null,
    audience: 'everyone',
    isActive: true,
    scope: null,
    imageUrl: null,
    createdAt: new Date('2026-01-05T10:00:00+07:00'),
    updatedAt: new Date('2026-01-05T10:00:00+07:00'),
  },
  {
    id: 2,
    name: 'สมาชิก ลด 20 บาท',
    kind: 'fixed',
    value: 2000,
    maxDiscountSatang: null,
    minSubtotalSatang: 15000,
    startsOn: null,
    endsOn: null,
    weekdays: null,
    windowStartMinute: null,
    windowEndMinute: null,
    audience: 'members',
    isActive: true,
    scope: null,
    imageUrl: null,
    createdAt: new Date('2026-01-05T10:00:00+07:00'),
    updatedAt: new Date('2026-01-05T10:00:00+07:00'),
  },
]

export const registers: DemoRegister[] = [
  { id: 1, branchId: 1, code: 'TILL-01', name: 'เครื่องแคชเชียร์ 1', isActive: true },
  { id: 2, branchId: 1, code: 'TILL-02', name: 'เครื่องแคชเชียร์ 2', isActive: true },
]
