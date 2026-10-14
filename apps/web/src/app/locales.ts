const th = {
  groups: {
    sales: 'งานขาย',
    manage: 'จัดการ',
  },
  nav: {
    sell: 'ขายสินค้า',
    today: 'วันนี้',
    reports: 'รายงานย้อนหลัง',
    shifts: 'กะและลิ้นชัก',
    products: 'สินค้าและสต็อก',
    categories: 'หมวดหมู่',
    modifiers: 'ตัวเลือกเสริม',
    tables: 'ผังโต๊ะ',
    branches: 'สาขา',
    users: 'ผู้ใช้',
    settings: 'ตั้งค่าร้าน',
    more: 'เมนู',
    bottom: 'เมนูหลัก',
  },
  roles: {
    owner: 'เจ้าของร้าน',
    cashier: 'แคชเชียร์',
  },
  theme: {
    label: 'ธีมสี',
    options: {
      light: 'สว่าง',
      dark: 'มืด',
      midnight: 'น้ำเงินเที่ยงคืน',
      forest: 'เขียวป่า',
      rose: 'ชมพูกุหลาบ',
    },
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
    reports: 'Sales reports',
    shifts: 'Shifts and drawer',
    products: 'Products & stock',
    categories: 'Categories',
    modifiers: 'Modifiers',
    tables: 'Floor plan',
    branches: 'Branches',
    users: 'Users',
    settings: 'Shop settings',
    more: 'Menu',
    bottom: 'Main menu',
  },
  roles: {
    owner: 'Owner',
    cashier: 'Cashier',
  },
  theme: {
    label: 'Color theme',
    options: {
      light: 'Light',
      dark: 'Dark',
      midnight: 'Midnight blue',
      forest: 'Forest green',
      rose: 'Rose',
    },
  },
  logout: 'Sign out',
} satisfies typeof th

export const locales = { th, en }
