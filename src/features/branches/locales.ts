const th = {
  title: 'สาขา',
  description: '{{items}} · สต็อก บิล และเลขใบเสร็จแยกตามสาขา',
  add: 'เพิ่มสาขา',
  switcherLabel: 'สาขาที่ทำงานอยู่',
  list: {
    title: 'รายการสาขา',
    description: 'รหัสสาขาเป็นตัวนำหน้าเลขใบเสร็จ และแก้ภายหลังไม่ได้',
    empty: 'ยังไม่มีสาขา',
  },
  columns: {
    code: 'รหัส',
    name: 'ชื่อสาขา',
    address: 'ที่อยู่',
    phone: 'เบอร์โทร',
    status: 'สถานะ',
    actions: 'การทำงาน',
  },
  status: {
    open: 'เปิดอยู่',
    closed: 'ปิดแล้ว',
  },
  actions: {
    edit: 'แก้ไข',
    close: 'ปิดสาขา',
    reopen: 'เปิดสาขาอีกครั้ง',
    more: 'การทำงานอื่นของ {{name}}',
  },
  toast: {
    created: 'เพิ่มสาขา "{{name}}" แล้ว',
    updated: 'บันทึกสาขา "{{name}}" แล้ว',
    closed: 'ปิดสาขา "{{name}}" แล้ว',
    reopened: 'เปิดสาขา "{{name}}" อีกครั้งแล้ว',
  },
  form: {
    titleNew: 'เพิ่มสาขา',
    titleEdit: 'แก้ไขสาขา',
    description: 'สาขาใหม่เริ่มต้นด้วยสต็อกเป็นศูนย์ ให้รับสินค้าเข้าที่สาขานั้น',
    code: 'รหัสสาขา',
    codeHint: 'A-Z หรือ 0-9 ยาว 2 ถึง 10 ตัว เช่น BKK01 แก้ภายหลังไม่ได้',
    name: 'ชื่อสาขา',
    address: 'ที่อยู่',
    phone: 'เบอร์โทร',
    optional: 'ไม่บังคับ',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
}

const en = {
  title: 'Branches',
  description: '{{items}} · stock, sales and receipt numbers are kept per branch',
  add: 'Add branch',
  switcherLabel: 'Working in',
  list: {
    title: 'Branches',
    description: 'The code prefixes receipt numbers and cannot be changed later',
    empty: 'No branches yet',
  },
  columns: {
    code: 'Code',
    name: 'Name',
    address: 'Address',
    phone: 'Phone',
    status: 'Status',
    actions: 'Actions',
  },
  status: {
    open: 'Open',
    closed: 'Closed',
  },
  actions: {
    edit: 'Edit',
    close: 'Close branch',
    reopen: 'Reopen branch',
    more: 'More actions for {{name}}',
  },
  toast: {
    created: 'Added branch "{{name}}"',
    updated: 'Saved branch "{{name}}"',
    closed: 'Closed branch "{{name}}"',
    reopened: 'Reopened branch "{{name}}"',
  },
  form: {
    titleNew: 'Add branch',
    titleEdit: 'Edit branch',
    description: 'A new branch starts with no stock; receive products into it',
    code: 'Branch code',
    codeHint: '2 to 10 characters, A-Z or 0-9, e.g. BKK01. It cannot be changed later',
    name: 'Name',
    address: 'Address',
    phone: 'Phone',
    optional: 'Optional',
    save: 'Save',
    saving: 'Saving…',
  },
} satisfies typeof th

export const locales = { th, en }
