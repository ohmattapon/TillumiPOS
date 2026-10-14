// Strings shared by every feature. Thai is the source of truth: English must have exactly the same keys.
const th = {
  loading: 'กำลังโหลด…',
  connectionFailed: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  cancel: 'ยกเลิก',
  all: 'ทั้งหมด',
  noMatches: 'ไม่พบรายการที่ตรงเงื่อนไข',
  pagination: {
    label: 'แบ่งหน้ารายการ',
    range: '{{from}}–{{to}} จาก {{total}} รายการ',
    page: '{{page}} / {{pages}}',
    first: 'แรก',
    previous: 'ก่อนหน้า',
    next: 'ถัดไป',
    last: 'สุดท้าย',
  },
  // Thai has a single plural form; both keys exist so English can differ.
  items_one: '{{count}} รายการ',
  items_other: '{{count}} รายการ',
  paymentMethods: {
    cash: 'เงินสด',
    promptpay: 'พร้อมเพย์',
    card: 'บัตร',
  },
}

const en = {
  loading: 'Loading…',
  connectionFailed: 'Cannot reach the server',
  cancel: 'Cancel',
  all: 'All',
  noMatches: 'No matching items',
  pagination: {
    label: 'List pagination',
    range: '{{from}}–{{to}} of {{total}} items',
    page: '{{page}} / {{pages}}',
    first: 'First',
    previous: 'Previous',
    next: 'Next',
    last: 'Last',
  },
  items_one: '{{count}} item',
  items_other: '{{count}} items',
  paymentMethods: {
    cash: 'Cash',
    promptpay: 'PromptPay',
    card: 'Card',
  },
} satisfies typeof th

export const common = { th, en }
