// Strings shared by every feature. Thai is the source of truth: English must have exactly the same keys.
const th = {
  loading: 'กำลังโหลด…',
  connectionFailed: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  cancel: 'ยกเลิก',
  close: 'ปิด',
  all: 'ทั้งหมด',
  noMatches: 'ไม่พบรายการที่ตรงเงื่อนไข',
  datePicker: {
    placeholder: 'เลือกวันที่', previousMonth: 'เดือนก่อนหน้า', nextMonth: 'เดือนถัดไป',
    month: 'เลือกเดือน', year: 'เลือกปี', today: 'วันนี้', selected: 'เลือกอยู่', navigation: 'เปลี่ยนเดือน',
  },
  pagination: {
    label: 'แบ่งหน้ารายการ',
    range: '{{from}}–{{to}} จาก {{total}} รายการ',
    page: '{{page}} / {{pages}}',
    goTo: 'ไปหน้าที่ {{page}}',
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
  close: 'Close',
  all: 'All',
  noMatches: 'No matching items',
  datePicker: {
    placeholder: 'Pick a date', previousMonth: 'Previous month', nextMonth: 'Next month',
    month: 'Choose month', year: 'Choose year', today: 'Today', selected: 'Selected', navigation: 'Change month',
  },
  pagination: {
    label: 'List pagination',
    range: '{{from}}–{{to}} of {{total}} items',
    page: '{{page}} / {{pages}}',
    goTo: 'Go to page {{page}}',
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
