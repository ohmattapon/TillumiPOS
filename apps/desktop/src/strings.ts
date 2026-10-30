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

  menu: {
    owner: 'เจ้าของร้าน',
    exitFullScreen: 'ออกจากโหมดเต็มจอ',
    enterFullScreen: 'กลับเข้าโหมดเต็มจอ',
    printerSettings: 'ตั้งค่าเครื่องพิมพ์',
    reload: 'โหลดหน้าใหม่',
    quit: 'ปิดโปรแกรม',
  },

  printerSettings: {
    title: 'ตั้งค่าเครื่องพิมพ์ใบเสร็จ',
    choose: 'เลือกเครื่องพิมพ์ใบเสร็จ',
    defaultMark: '(เครื่องพิมพ์หลักของ Windows)',
    none: 'ไม่พบเครื่องพิมพ์ที่ติดตั้งในเครื่องนี้',
    save: 'บันทึก',
    cancel: 'ยกเลิก',
  },

  print: {
    failed: 'พิมพ์ใบเสร็จไม่สำเร็จ กรุณาตรวจเครื่องพิมพ์',
    noPrinter: 'ยังไม่ได้เลือกเครื่องพิมพ์ใบเสร็จ',
  },
} as const
