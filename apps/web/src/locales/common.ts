// Strings shared by every feature. Thai is the source of truth: English must have exactly the same keys.
const th = {
  loading: 'กำลังโหลด…',
  connectionFailed: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  cancel: 'ยกเลิก',
  all: 'ทั้งหมด',
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
  items_one: '{{count}} item',
  items_other: '{{count}} items',
  paymentMethods: {
    cash: 'Cash',
    promptpay: 'PromptPay',
    card: 'Card',
  },
} satisfies typeof th

export const common = { th, en }
