const th = {
  groups: {
    sales: 'งานขาย',
    manage: 'จัดการ',
  },
  nav: {
    sell: 'ขายสินค้า',
    today: 'วันนี้',
    products: 'สินค้าและสต็อก',
    branches: 'สาขา',
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
    products: 'Products & stock',
    branches: 'Branches',
    settings: 'Shop settings',
  },
  roles: {
    owner: 'Owner',
    cashier: 'Cashier',
  },
  logout: 'Sign out',
} satisfies typeof th

export const locales = { th, en }
