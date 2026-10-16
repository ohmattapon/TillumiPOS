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
  pairing: {
    hint: 'พนักงานกรอกรหัสนี้ที่หน้าขายเพื่อเชื่อมจอ',
    code: 'รหัสเชื่อมจอ {{code}}',
  },
  pair: {
    title: 'เชื่อมจอลูกค้า',
    description: 'เปิดหน้าจอลูกค้าบนอีกเครื่อง แล้วกรอกรหัส 6 หลักที่จอแสดง',
    codeLabel: 'รหัสเชื่อมจอ 6 หลัก',
    submit: 'เชื่อมจอ',
    connected_one: 'เชื่อมอยู่ {{count}} จอ',
    connected_other: 'เชื่อมอยู่ {{count}} จอ',
    disconnect: 'ถอดจอ',
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
  pairing: {
    hint: 'Staff: enter this code on the till to connect this screen',
    code: 'Pairing code {{code}}',
  },
  pair: {
    title: 'Connect a customer screen',
    description: 'Open the customer screen on another device, then enter the 6-digit code it shows.',
    codeLabel: '6-digit pairing code',
    submit: 'Connect',
    connected_one: '{{count}} screen connected',
    connected_other: '{{count}} screens connected',
    disconnect: 'Disconnect',
  },
  paid: {
    title: 'Paid',
    thanks: 'Thank you',
    change: 'Change',
  },
} satisfies typeof th

export const locales = { th, en }
