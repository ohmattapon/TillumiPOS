const th = {
  title: 'ใบรับสินค้าเข้า', description: 'รับสินค้าหลายรายการและดูประวัติการรับเข้า', new: 'เริ่มใบรับใหม่', draft: 'รับสินค้าเข้า',
  addAction: 'เพิ่ม', removeAction: 'ลบ', search: 'ค้นหาสินค้า', add: 'เพิ่ม {{name}}', quantity: 'จำนวนรับเข้า {{name}}', note: 'หมายเหตุ', submit: 'บันทึกรับเข้า',
  retrySubmission: 'ตรวจสอบและส่งซ้ำ', unknown: 'ยังไม่ทราบผลการรับเข้า รายการถูกล็อกไว้ กรุณาตรวจสอบและส่งซ้ำ ระบบจะใช้คำขอเดิมเพื่อป้องกันยอดซ้ำ',
  storageError: 'ไม่สามารถใช้ใบรับที่บันทึกไว้ได้ หรือมีการแก้ไขจากหน้าต่างอื่น เพื่อป้องกันรับเข้าซ้ำ กรุณาปิดหน้าต่างอื่นแล้วโหลดหน้านี้ใหม่ หากยังผิดพลาดให้ตรวจใบรับย้อนหลังและติดต่อผู้ดูแล',
  reload: 'โหลดหน้าใหม่', confirmed: 'บันทึกรับเข้าเรียบร้อยแล้ว', history: 'ดูประวัติการรับเข้า', receipt: 'ใบรับเข้า #{{id}}',
  product: 'สินค้า', sku: 'SKU', qty: 'จำนวนรับเข้า', balance: 'คงเหลือหลังรับ', receiver: 'ผู้รับเข้า', time: 'เวลา', items: 'รายการสินค้า',
  empty: 'ยังไม่มีใบรับเข้า', noItems: 'ยังไม่ได้เลือกสินค้า', noProducts: 'ไม่พบสินค้า', remove: 'ลบ {{name}}',
  invalid: 'ตรวจสอบสินค้ารายการนี้', untracked: 'สินค้านี้ไม่ได้เปิดนับสต็อก', limit: 'ค้นหาแสดงครั้งละ 20 รายการ กรุณาพิมพ์ชื่อหรือรหัสเพื่อค้นหาให้เจาะจง',
  discard: 'ล้างใบที่ยังไม่ส่ง', discardTitle: 'ล้างใบรับที่ยังไม่ส่ง?', discardDescription: 'รายการที่เลือกและหมายเหตุจะถูกล้างเพื่อเริ่มใบใหม่',
  failed: 'ไม่สามารถโหลดข้อมูลได้', retry: 'ลองอีกครั้ง', close: 'ปิด', missing: 'สินค้า #{{id}}', loading: 'กำลังโหลดสินค้า',
  rowCount: '{{count}} รายการ', working: 'กำลังบันทึก กรุณารอ',
}
const en = {
  title: 'Stock receipts', description: 'Receive multiple products and review receipt history', new: 'New receipt', draft: 'Receive stock',
  addAction: 'Add', removeAction: 'Remove', search: 'Search products', add: 'Add {{name}}', quantity: 'Quantity received {{name}}', note: 'Note', submit: 'Save receipt',
  retrySubmission: 'Check and retry', unknown: 'The outcome is unknown. Items are locked. Check and retry the same request to prevent duplicate stock.',
  storageError: 'The saved receipt cannot be used, or another window changed it. To prevent duplicate stock, close other windows and reload. If this continues, check receipt history and contact an administrator.',
  reload: 'Reload page', confirmed: 'Stock receipt saved', history: 'Receipt history', receipt: 'Receipt #{{id}}',
  product: 'Product', sku: 'SKU', qty: 'Quantity received', balance: 'Balance after receipt', receiver: 'Received by', time: 'Time', items: 'Products',
  empty: 'No stock receipts yet', noItems: 'No products selected', noProducts: 'No matching products', remove: 'Remove {{name}}',
  invalid: 'Check this product', untracked: 'This product does not track stock', limit: 'Showing up to 20 results. Enter a name or code to narrow your search.',
  discard: 'Clear unsent draft', discardTitle: 'Clear this unsent receipt?', discardDescription: 'Selected items and the note will be cleared to start a new receipt.',
  failed: 'Unable to load data', retry: 'Retry', close: 'Close', missing: 'Product #{{id}}', loading: 'Loading product',
  rowCount: '{{count}} items', working: 'Saving, please wait',
} satisfies typeof th
export const locales = { th, en }
