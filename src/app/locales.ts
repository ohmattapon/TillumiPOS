const th = {
  groups: {
    sales: 'งานขาย',
    manage: 'จัดการ',
  },
  nav: {
    sell: 'ขายสินค้า',
    floor: 'โต๊ะ',
    today: 'วันนี้',
    kitchen: 'ครัว',
    kitchenStations: 'สถานีครัว',
    reports: 'รายงานย้อนหลัง',
    shifts: 'กะและลิ้นชัก',
    products: 'สินค้าและสต็อก',
    categories: 'หมวดหมู่',
    modifiers: 'ตัวเลือกเสริม',
    tables: 'ผังโต๊ะ',
    members: '\u0e2a\u0e21\u0e32\u0e0a\u0e34\u0e01',
    users: 'ผู้ใช้',
    roles: 'บทบาทและสิทธิ์',
    audit: 'ประวัติการกระทำ',
    settings: 'ตั้งค่าร้าน',
    promotions: 'โปรโมชัน',
    displaySlides: 'สไลด์จอลูกค้า',
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
    floor: 'Tables',
    today: 'Today',
    kitchen: 'Kitchen',
    kitchenStations: 'Kitchen stations',
    reports: 'Sales reports',
    shifts: 'Shifts and drawer',
    products: 'Products & stock',
    categories: 'Categories',
    modifiers: 'Modifiers',
    tables: 'Floor plan',
    users: 'Users',
    roles: 'Roles and permissions',
    audit: 'Action history',
    members: 'Members',
    promotions: 'Promotions',
    displaySlides: 'Display slides',
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
