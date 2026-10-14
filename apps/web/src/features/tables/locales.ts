const th = {
  title: 'ผังโต๊ะ',
  description: '{{items}} · ลากโต๊ะไปวางตามจริง ดึงมุมขวาล่างเพื่อปรับขนาด',
  add: 'เพิ่มโต๊ะ',
  empty: 'ยังไม่มีโต๊ะ กด "เพิ่มโต๊ะ" แล้วลากไปวางตามผังร้าน',
  floor: 'ผังร้าน',
  seats: '{{count}} ที่นั่ง',
  phoneNote: 'จัดตำแหน่งโต๊ะบนผังได้บนจอที่ใหญ่กว่านี้ ที่นี่แก้ชื่อ ที่นั่ง และเปิดปิดโต๊ะได้',
  free: 'ว่าง',
  orders: '{{count}} ออเดอร์',
  inactive: 'ปิดใช้งาน',
  details: {
    title: 'ข้อมูลโต๊ะ',
    select: 'เลือกโต๊ะบนผังเพื่อแก้ไข',
    name: 'ชื่อโต๊ะ',
    zone: 'โซน',
    zoneHint: 'เช่น ในร้าน ระเบียง (ไม่บังคับ)',
    seats: 'จำนวนที่นั่ง',
    active: 'เปิดใช้งาน',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
  toast: {
    created: 'เพิ่มโต๊ะ "{{name}}" แล้ว',
    updated: 'บันทึกโต๊ะ "{{name}}" แล้ว',
  },
  newTable: {
    title: 'เพิ่มโต๊ะ',
    description: 'ตั้งชื่อก่อน แล้วลากไปวางบนผัง',
  },
}

const en = {
  title: 'Floor plan',
  description: '{{items}} · drag tables where they are, pull the bottom right corner to resize',
  add: 'Add table',
  empty: 'No tables yet. Press "Add table", then drag it into place.',
  floor: 'Floor plan',
  seats: '{{count}} seats',
  phoneNote: 'Arrange the floor plan on a larger screen; here you can change the name and seats of a table, or turn it on or off.',
  free: 'Free',
  orders: '{{count}} orders',
  inactive: 'Deactivated',
  details: {
    title: 'Table',
    select: 'Select a table on the plan to edit it',
    name: 'Table name',
    zone: 'Zone',
    zoneHint: 'For example indoors, terrace (optional)',
    seats: 'Seats',
    active: 'In use',
    save: 'Save',
    saving: 'Saving…',
  },
  toast: {
    created: 'Added table "{{name}}"',
    updated: 'Saved table "{{name}}"',
  },
  newTable: {
    title: 'Add table',
    description: 'Give it a name, then drag it into place',
  },
} satisfies typeof th

export const locales = { th, en }
