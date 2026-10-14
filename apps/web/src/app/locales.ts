const th = {
  groups: {
    sales: 'งานขาย',
    manage: 'จัดการ',
  },
  nav: {
    sell: 'ขายสินค้า',
    today: 'วันนี้',
    shifts: 'กะและลิ้นชัก',
    products: 'สินค้าและสต็อก',
    categories: 'หมวดหมู่',
    modifiers: 'ตัวเลือกเสริม',
    tables: 'ผังโต๊ะ',
    branches: 'สาขา',
    users: 'ผู้ใช้',
    settings: 'ตั้งค่าร้าน',
  },
  roles: {
    owner: 'เจ้าของร้าน',
    cashier: 'แคชเชียร์',
  },
  logout: 'ออกจากระบบ',
}

const en = {
  groups: {
    sales: 'Sales',
    manage: 'Manage',
  },
  nav: {
    sell: 'Sell',
    today: 'Today',
    shifts: 'Shifts and drawer',
    products: 'Products & stock',
    categories: 'Categories',
    modifiers: 'Modifiers',
    tables: 'Floor plan',
    branches: 'Branches',
    users: 'Users',
    settings: 'Shop settings',
  },
  roles: {
    owner: 'Owner',
    cashier: 'Cashier',
  },
  logout: 'Sign out',
} satisfies typeof th

export const locales = { th, en }
