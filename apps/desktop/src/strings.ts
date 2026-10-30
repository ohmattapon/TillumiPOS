// The app has no i18n framework: every text a user reads is here, Thai only, under English keys.
export const strings = {
  appName: 'TillumiPOS',

  waiting: {
    title: 'กำลังเตรียมระบบหน้าร้าน',
    message: 'ระบบกำลังเริ่มทำงาน กรุณารอสักครู่ ระบบจะเปิดหน้าขายให้เองเมื่อพร้อม',
    hint: 'ถ้ารอนานเกินไป ให้ตรวจว่าเครื่องเปิดอยู่และบริการ TillumiPOS ทำงานอยู่',
    retrying: 'กำลังลองใหม่อีกครั้ง',
  },

  config: {
    invalidShopUrlTitle: 'ตั้งค่าที่อยู่ของระบบหน้าร้านไม่ถูกต้อง',
    invalidShopUrlMessage: 'TILLUMI_SHOP_URL ต้องเป็น http://127.0.0.1:<พอร์ต> หรือ http://localhost:<พอร์ต> เท่านั้น',
  },

  errors: {
    menuFailed: 'เปิดเมนูเจ้าของร้านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    openShopFailed: 'เปิดหน้าขายไม่สำเร็จ กรุณาปิดโปรแกรมแล้วเปิดใหม่อีกครั้ง',
  },

  menu: {
    owner: 'เจ้าของร้าน',
    exitFullScreen: 'ออกจากโหมดเต็มจอ',
    enterFullScreen: 'กลับเข้าโหมดเต็มจอ',
    reload: 'โหลดหน้าใหม่',
    quit: 'ปิดโปรแกรม',
  },
} as const
