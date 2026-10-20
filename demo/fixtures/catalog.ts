import type { Category, DiningTable, ModifierGroup, Product } from '@pos/api/types'

// Thai coffee-shop catalog: 6 categories, 43 products with satang prices,
// 3 modifier groups (two required, one optional), 8 floor tables.
// IDs are stable so orders and bills can point at them.

function category(id: number, name: string, sortOrder: number): Category {
  return { id, name, sortOrder, isActive: true }
}

export const categories: Category[] = [
  category(1, 'กาแฟร้อน', 1),
  category(2, 'กาแฟเย็น', 2),
  category(3, 'ชาและมัทฉะ', 3),
  category(4, 'เครื่องดื่มอื่น ๆ', 4),
  category(5, 'ขนมและเบเกอรี่', 5),
  category(6, 'เมล็ดกาแฟและของฝาก', 6),
]

function product(
  id: number,
  sku: string,
  name: string,
  categoryId: number,
  productType: Product['productType'],
  priceSatang: number,
  costSatang: number,
  trackStock: boolean,
  stockQty: number,
  barcode: string | null = null,
): Product {
  return {
    id,
    sku,
    barcode,
    name,
    categoryId,
    productType,
    priceSatang,
    costSatang,
    trackStock,
    isActive: true,
    stockQty,
    imageUrl: null,
  }
}

// Made-to-order drinks are not stock-tracked (plenty on hand); retail and
// bakery are, with a few low items so the low-stock panel has something to show.
export const products: Product[] = [
  product(1, 'CF-H01', 'เอสเพรสโซ่ร้อน', 1, 'cafe', 4500, 1200, false, 999),
  product(2, 'CF-H02', 'อเมริกาโน่ร้อน', 1, 'cafe', 5000, 1300, false, 999),
  product(3, 'CF-H03', 'ลาเต้ร้อน', 1, 'cafe', 5500, 1600, false, 999),
  product(4, 'CF-H04', 'คาปูชิโน่ร้อน', 1, 'cafe', 5500, 1600, false, 999),
  product(5, 'CF-H05', 'มอคค่าร้อน', 1, 'cafe', 6000, 1900, false, 999),
  product(6, 'CF-H06', 'คาราเมลมัคคิอาโตร้อน', 1, 'cafe', 6500, 2100, false, 999),
  product(7, 'CF-I01', 'อเมริกาโน่เย็น', 2, 'cafe', 5500, 1400, false, 999),
  product(8, 'CF-I02', 'ลาเต้เย็น', 2, 'cafe', 6000, 1700, false, 999),
  product(9, 'CF-I03', 'คาปูชิโน่เย็น', 2, 'cafe', 6000, 1700, false, 999),
  product(10, 'CF-I04', 'มอคค่าเย็น', 2, 'cafe', 6500, 2000, false, 999),
  product(11, 'CF-I05', 'เอสเพรสโซ่เย็น', 2, 'cafe', 6000, 1500, false, 999),
  product(12, 'CF-I06', 'กาแฟน้ำผึ้งมะนาว', 2, 'cafe', 6500, 2000, false, 999),
  product(13, 'CF-I07', 'กาแฟส้ม', 2, 'cafe', 7000, 2200, false, 999),
  product(14, 'CF-I08', 'นมสดเย็น', 2, 'cafe', 5000, 1400, false, 999),
  product(15, 'CF-I09', 'โกโก้เย็น', 2, 'cafe', 6000, 1800, false, 999),
  product(16, 'CF-I10', 'ชาไทยเย็น', 2, 'cafe', 5500, 1500, false, 999),
  product(17, 'TE-01', 'ชาเขียวร้อน', 3, 'cafe', 4500, 1100, false, 999),
  product(18, 'TE-02', 'มัทฉะลาเต้ร้อน', 3, 'cafe', 6500, 2200, false, 999),
  product(19, 'TE-03', 'มัทฉะลาเต้เย็น', 3, 'cafe', 7000, 2400, false, 999),
  product(20, 'TE-04', 'ชาดำเย็น', 3, 'cafe', 5000, 1200, false, 999),
  product(21, 'TE-05', 'ชามะนาว', 3, 'cafe', 5500, 1400, false, 999),
  product(22, 'TE-06', 'ชาพีช', 3, 'cafe', 6000, 1700, false, 999),
  product(23, 'TE-07', 'นมชมพู', 3, 'cafe', 5500, 1500, false, 999),
  product(24, 'DR-01', 'น้ำเปล่า', 4, 'cafe', 2000, 700, true, 48),
  product(25, 'DR-02', 'น้ำส้มคั้น', 4, 'cafe', 6000, 2200, false, 999),
  product(26, 'DR-03', 'สมูทตี้สตรอว์เบอร์รี่', 4, 'cafe', 7500, 2600, false, 999),
  product(27, 'DR-04', 'สมูทตี้มะม่วง', 4, 'cafe', 7500, 2500, false, 999),
  product(28, 'DR-05', 'อิตาเลียนโซดาบลูฮาวาย', 4, 'cafe', 6000, 1700, false, 999),
  product(29, 'DR-06', 'นมสดร้อน', 4, 'cafe', 5000, 1400, false, 999),
  product(30, 'DR-07', 'ช็อกโกแลตร้อน', 4, 'cafe', 6000, 1900, false, 999),
  product(31, 'BK-01', 'ครัวซองต์เนยสด', 5, 'normal', 5500, 2800, true, 12),
  product(32, 'BK-02', 'ครัวซองต์อัลมอนด์', 5, 'normal', 6500, 3300, true, 8),
  product(33, 'BK-03', 'ขนมปังปิ้งเนยนม', 5, 'normal', 4500, 1500, false, 999),
  product(34, 'BK-04', 'เค้กช็อกโกแลต', 5, 'normal', 7500, 3200, true, 6),
  product(35, 'BK-05', 'เค้กส้ม', 5, 'normal', 7000, 3000, true, 5),
  product(36, 'BK-06', 'ชีสเค้ก', 5, 'normal', 8000, 3600, true, 3),
  product(37, 'BK-07', 'คุกกี้เนยสด', 5, 'normal', 3500, 1200, true, 2),
  product(38, 'BK-08', 'บราวนี่', 5, 'normal', 6000, 2400, true, 7),
  product(39, 'BK-09', 'พายไก่', 5, 'normal', 6500, 2900, true, 4),
  product(40, 'RT-01', 'เมล็ดกาแฟคั่วกลาง 250ก.', 6, 'normal', 32000, 18000, true, 15, '885000000001'),
  product(41, 'RT-02', 'เมล็ดกาแฟคั่วเข้ม 250ก.', 6, 'normal', 32000, 18000, true, 0, '885000000002'),
  product(42, 'RT-03', 'ดริปแบ็ก 5 ซอง', 6, 'normal', 25000, 13000, true, 9, '885000000003'),
  product(43, 'RT-04', 'แก้วเก็บความเย็น', 6, 'normal', 45000, 22000, true, 6, '885000000004'),
]

// A few showcase pictures (local files under public/demo/) so the menu is not all grey boxes.
products.find((item) => item.id === 8)!.imageUrl = '/demo/product-espresso.svg'
products.find((item) => item.id === 19)!.imageUrl = '/demo/product-matcha.svg'
products.find((item) => item.id === 31)!.imageUrl = '/demo/product-croissant.svg'

const hotDrinkIds = [1, 2, 3, 4, 5, 6]
const icedDrinkIds = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 25, 26, 27, 28]

export const modifierGroups: ModifierGroup[] = [
  {
    id: 1,
    name: 'ระดับความหวาน',
    required: true,
    maxSelections: 1,
    sortOrder: 1,
    isActive: true,
    options: [
      { id: 1, groupId: 1, name: 'หวานปกติ', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: true, isDefault: true },
      { id: 2, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 2, isActive: true, isDefault: false },
      { id: 3, groupId: 1, name: 'ไม่หวาน', priceSatang: 0, costSatang: 0, sortOrder: 3, isActive: true, isDefault: false },
      { id: 4, groupId: 1, name: 'หวานมาก', priceSatang: 500, costSatang: 200, sortOrder: 4, isActive: true, isDefault: false },
    ],
    productIds: [...hotDrinkIds, ...icedDrinkIds],
  },
  {
    id: 2,
    name: 'ท็อปปิ้ง',
    required: false,
    maxSelections: 3,
    sortOrder: 2,
    isActive: true,
    options: [
      { id: 5, groupId: 2, name: 'วิปครีม', priceSatang: 1500, costSatang: 600, sortOrder: 1, isActive: true, isDefault: false },
      { id: 6, groupId: 2, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400, sortOrder: 2, isActive: true, isDefault: false },
      { id: 7, groupId: 2, name: 'เยลลี่กาแฟ', priceSatang: 1000, costSatang: 400, sortOrder: 3, isActive: true, isDefault: false },
      { id: 8, groupId: 2, name: 'นมข้นหวานเพิ่ม', priceSatang: 500, costSatang: 200, sortOrder: 4, isActive: true, isDefault: false },
    ],
    productIds: icedDrinkIds,
  },
  {
    id: 3,
    name: 'ขนาดแก้ว',
    required: true,
    maxSelections: 1,
    sortOrder: 3,
    isActive: true,
    options: [
      { id: 9, groupId: 3, name: 'แก้วเล็ก', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: true, isDefault: true },
      { id: 10, groupId: 3, name: 'แก้วกลาง', priceSatang: 1000, costSatang: 300, sortOrder: 2, isActive: true, isDefault: false },
      { id: 11, groupId: 3, name: 'แก้วใหญ่', priceSatang: 2000, costSatang: 500, sortOrder: 3, isActive: true, isDefault: false },
    ],
    productIds: [...hotDrinkIds, ...icedDrinkIds],
  },
]

function table(
  id: number,
  name: string,
  zone: string | null,
  seats: number,
  x: number,
  y: number,
  width: number,
  height: number,
): DiningTable {
  return {
    id,
    branchId: 1,
    name,
    zone,
    seats,
    x,
    y,
    width,
    height,
    sortOrder: id,
    isActive: true,
    // Filled per request from the open orders; fixtures keep zero.
    openOrders: 0,
    openTotalSatang: 0,
  }
}

// Floor plan units are 1000 wide and 700 high.
export const tables: DiningTable[] = [
  table(1, 'A1', 'ด้านใน', 2, 60, 60, 120, 100),
  table(2, 'A2', 'ด้านใน', 2, 220, 60, 120, 100),
  table(3, 'A3', 'ด้านใน', 4, 380, 60, 150, 100),
  table(4, 'B1', 'ด้านนอก', 2, 60, 240, 120, 100),
  table(5, 'B2', 'ด้านนอก', 4, 220, 240, 150, 100),
  table(6, 'B3', 'ด้านนอก', 6, 410, 240, 180, 110),
  table(7, 'C1', 'ชั้นลอย', 2, 60, 420, 120, 100),
  table(8, 'C2', 'ชั้นลอย', 4, 220, 420, 150, 100),
]
