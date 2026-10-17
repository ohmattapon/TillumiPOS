export type PageItem = number | '…'

/**
 * ตัดเลขหน้าแบบ minimal: หน้าแสดงผลเป็น 1-based
 * - pages <= 7 คืนครบทุกหน้า
 * - ต้นเล่ม (หน้าที่ 1-3) คืน [1,2,3,…,last]
 * - ท้ายเล่ม (3 หน้าสุดท้าย) คืน [1,…,last-2,last-1,last]
 * - กลางเล่ม คืน [1,…,p-1,p,p+1,…,last]
 * รับ page เป็น 0-based ตาม PaginationBar
 */
export function getPageItems(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: Math.max(pages, 0) }, (_, i) => i + 1)
  const current = Math.min(Math.max(page + 1, 1), pages)
  if (current <= 3) return [1, 2, 3, '…', pages]
  if (current >= pages - 2) return [1, '…', pages - 2, pages - 1, pages]
  return [1, '…', current - 1, current, current + 1, '…', pages]
}
