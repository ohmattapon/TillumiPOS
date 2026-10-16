const th = {
  title: 'ประวัติการกระทำ', description: 'ตรวจสอบการเปลี่ยนแปลงด้านเงิน สต็อก และสิทธิ์', empty: 'ไม่พบประวัติในช่วงที่เลือก',
  from: 'ตั้งแต่วันที่', to: 'ถึงวันที่', actor: 'ผู้กระทำ (รหัสผู้ใช้)', action: 'เหตุการณ์', all: 'ทั้งหมด', apply: 'ค้นหา', reset: 'ล้างตัวกรอง',
  time: 'เวลา', person: 'ผู้กระทำ', summary: 'รายการ', branch: 'สาขา', details: 'ค่าที่เปลี่ยนแปลง', field: 'ข้อมูล', before: 'ก่อน', after: 'หลัง', reason: 'เหตุผล', noChanges: 'ไม่มีค่าก่อนและหลัง', noValue: 'ไม่มีค่า',
  actions: {
    'sale.void': 'ยกเลิกบิล', 'sale.cash_refund': 'คืนเงินสด', 'qr.dismiss': 'ปิดรายการ QR',
    'product.create': 'สร้างสินค้า', 'product.update': 'แก้ไขสินค้า', 'stock.receive': 'รับสินค้าเข้า', 'stock.adjust': 'ปรับยอดสต็อก',
    'shift.override_close': 'ดำเนินการกะแทนผู้อื่น', 'user.create': 'สร้างผู้ใช้', 'user.update': 'แก้ไขผู้ใช้',
    'role.create': 'สร้างบทบาท', 'role.update': 'แก้ไขบทบาท', 'role.delete': 'ลบบทบาท', 'settings.update': 'แก้ไขการตั้งค่า', 'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
  },
}
const en = {
  title: 'Action history', description: 'Review changes to money, stock and permissions', empty: 'No actions match these filters',
  from: 'From date', to: 'To date', actor: 'Actor (user ID)', action: 'Action', all: 'All', apply: 'Search', reset: 'Clear filters',
  time: 'Time', person: 'Actor', summary: 'Action', branch: 'Branch', details: 'Changed values', field: 'Field', before: 'Before', after: 'After', reason: 'Reason', noChanges: 'No before or after values', noValue: 'No value',
  actions: {
    'sale.void': 'Sale voided', 'sale.cash_refund': 'Cash refunded', 'qr.dismiss': 'QR payment dismissed',
    'product.create': 'Product created', 'product.update': 'Product updated', 'stock.receive': 'Stock received', 'stock.adjust': 'Stock adjusted',
    'shift.override_close': 'Shift overridden', 'user.create': 'User created', 'user.update': 'User updated',
    'role.create': 'Role created', 'role.update': 'Role updated', 'role.delete': 'Role deleted', 'settings.update': 'Settings updated', 'auth.login_failed': 'Sign-in failed',
  },
} satisfies typeof th
export const locales = { th, en }
