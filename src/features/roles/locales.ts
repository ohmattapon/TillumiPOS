const th = {
  title: 'บทบาทและสิทธิ์', description: 'กำหนดสิ่งที่พนักงานแต่ละบทบาททำได้', add: 'เพิ่มบทบาท', edit: 'แก้ไข', remove: 'ลบ',
  name: 'ชื่อบทบาท', users: 'ผู้ใช้', permissions: 'สิทธิ์', empty: 'ยังไม่มีบทบาท', system: 'บทบาทระบบ', grantedSummary: '{{granted}} จาก {{total}} สิทธิ์', ownerHint: 'เจ้าของร้านมีทุกสิทธิ์เสมอ',
  newTitle: 'สร้างบทบาท', editTitle: 'แก้ไขบทบาท', formHint: 'เลือกเฉพาะหน้าที่ที่ต้องการมอบหมาย', save: 'บันทึก', saving: 'กำลังบันทึก…', saved: 'บันทึกบทบาทแล้ว', removed: 'ลบบทบาทแล้ว',
  deleteTitle: 'ลบบทบาทนี้?', deleteHint: 'ลบ {{name}} ได้เมื่อไม่มีผู้ใช้ถือบทบาทนี้',
  groups: { sales: 'การขายและรายงาน', catalog: 'สินค้าและบริการ', inventory: 'สต็อก', operations: 'การทำงานของร้าน', admin: 'ผู้ใช้และประวัติ' },
  permission: {
    'sales.void': 'ยกเลิกบิลและคืนเงินสด', 'qr.dismiss': 'ปิดรายการ QR', 'reports.read': 'ดูและส่งออกรายงาน',
    'products.write': 'จัดการสินค้าและรูป', 'categories.write': 'จัดการหมวดหมู่', 'modifiers.write': 'จัดการตัวเลือกเสริม',
    'promotions.write': 'จัดการโปรโมชัน', 'members.write': 'แก้ไขสมาชิก', 'members.points_adjust': 'ปรับแต้มสมาชิกด้วยมือ', 'tables.write': 'จัดการโต๊ะ',
    'inventory.receive': 'รับสินค้าเข้า', 'inventory.adjust': 'ปรับยอดสต็อก', 'registers.manage': 'จัดการจุดขาย', 'branches.manage': 'จัดการสาขา',
    'branches.switch': 'สลับสาขาที่ทำงาน', 'shifts.override': 'ปิดหรือตรวจนับกะแทนผู้อื่น', 'settings.write': 'แก้การตั้งค่าร้าน',
    'users.manage': 'จัดการผู้ใช้', 'roles.manage': 'จัดการบทบาทและสิทธิ์', 'audit.read': 'ดูประวัติการกระทำ',
  },
}
const en = {
  title: 'Roles and permissions', description: 'Choose what staff in each role can do', add: 'Add role', edit: 'Edit', remove: 'Delete',
  name: 'Role name', users: 'Users', permissions: 'Permissions', empty: 'No roles', system: 'System role', grantedSummary: '{{granted}} of {{total}}', ownerHint: 'Owners always have every permission',
  newTitle: 'Create role', editTitle: 'Edit role', formHint: 'Grant only the responsibilities this role needs', save: 'Save', saving: 'Saving…', saved: 'Role saved', removed: 'Role deleted',
  deleteTitle: 'Delete this role?', deleteHint: '{{name}} can be deleted when no user holds it',
  groups: { sales: 'Sales and reports', catalog: 'Products and services', inventory: 'Stock', operations: 'Shop operations', admin: 'Users and history' },
  permission: {
    'sales.void': 'Void sales and refund cash', 'qr.dismiss': 'Dismiss QR payments', 'reports.read': 'Read and export reports',
    'products.write': 'Manage products and images', 'categories.write': 'Manage categories', 'modifiers.write': 'Manage modifiers',
    'promotions.write': 'Manage promotions', 'members.write': 'Edit members', 'members.points_adjust': 'Adjust member points by hand', 'tables.write': 'Manage tables',
    'inventory.receive': 'Receive stock', 'inventory.adjust': 'Adjust stock', 'registers.manage': 'Manage registers', 'branches.manage': 'Manage branches',
    'branches.switch': 'Switch working branch', 'shifts.override': 'Override another staff member’s shift count', 'settings.write': 'Edit shop settings',
    'users.manage': 'Manage users', 'roles.manage': 'Manage roles and permissions', 'audit.read': 'Read action history',
  },
} satisfies typeof th
export const locales = { th, en }
