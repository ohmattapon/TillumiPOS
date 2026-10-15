const th = {
  brand: 'TillumiPOS',
  fullscreen: 'คลิกที่จอเพื่อเต็มจอ',
  idle: {
    welcome: 'ยินดีต้อนรับ',
  },
  selling: {
    subtotal: 'รวม',
    discount: 'ส่วนลด',
    vatIncluded: 'รวมภาษีมูลค่าเพิ่ม',
    vatAdded: 'ภาษีมูลค่าเพิ่ม',
    total: 'ยอดสุทธิ',
  },
  paying: {
    due: 'ยอดที่ต้องจ่าย',
    scan: 'สแกนเพื่อชำระ',
    qrAlt: 'QR สำหรับชำระเงิน',
    expires: 'หมดอายุเวลา {{time}}',
  },
  paid: {
    title: 'ชำระแล้ว',
    thanks: 'ขอบคุณที่ใช้บริการ',
    change: 'เงินทอน',
  },
}

const en = {
  brand: 'TillumiPOS',
  fullscreen: 'Click the screen for full screen',
  idle: {
    welcome: 'Welcome',
  },
  selling: {
    subtotal: 'Subtotal',
    discount: 'Discount',
    vatIncluded: 'VAT included',
    vatAdded: 'VAT',
    total: 'Total',
  },
  paying: {
    due: 'Amount due',
    scan: 'Scan to pay',
    qrAlt: 'Payment QR code',
    expires: 'Expires at {{time}}',
  },
  paid: {
    title: 'Paid',
    thanks: 'Thank you',
    change: 'Change',
  },
} satisfies typeof th

export const locales = { th, en }
