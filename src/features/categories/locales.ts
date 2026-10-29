const th = {
  title: 'หมวดหมู่',
  description: '{{items}}',
  add: 'เพิ่มหมวดหมู่',
  list: {
    title: 'รายการหมวดหมู่',
    description: 'เรียงตามลำดับจากน้อยไปมาก หมวดที่ปิดใช้งานจะไม่แสดงในหน้าขาย',
    empty: 'ยังไม่มีหมวดหมู่',
  },
  columns: {
    name: 'ชื่อหมวดหมู่',
    sortOrder: 'ลำดับ',
    status: 'สถานะ',
    actions: 'การทำงาน',
  },
  status: {
    active: 'ใช้งานอยู่',
    inactive: 'ปิดใช้งาน',
  },
  actions: {
    more: 'การทำงานอื่นของ {{name}}',
    edit: 'แก้ไข',
    deactivate: 'ปิดใช้งาน',
    activate: 'เปิดใช้งาน',
  },
  toast: {
    created: 'เพิ่มหมวดหมู่ "{{name}}" แล้ว',
    updated: 'บันทึกหมวดหมู่ "{{name}}" แล้ว',
    deactivated: 'ปิดใช้งาน "{{name}}" แล้ว',
    activated: 'เปิดใช้งาน "{{name}}" แล้ว',
  },
  form: {
    titleNew: 'เพิ่มหมวดหมู่',
    titleEdit: 'แก้ไขหมวดหมู่',
    description: 'สินค้าเลือกหมวดหมู่ได้ในหน้าแก้ไขสินค้า',
    name: 'ชื่อหมวดหมู่',
    sortOrder: 'ลำดับการแสดง',
    sortOrderHint: 'เลขน้อยแสดงก่อน',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
}

const en = {
  title: 'Categories',
  description: '{{items}}',
  add: 'Add category',
  list: {
    title: 'Categories',
    description: 'Ordered from the lowest number. A deactivated category is not shown on the sell screen.',
    empty: 'No categories yet',
  },
  columns: {
    name: 'Name',
    sortOrder: 'Order',
    status: 'Status',
    actions: 'Actions',
  },
  status: {
    active: 'In use',
    inactive: 'Deactivated',
  },
  actions: {
    more: 'More actions for {{name}}',
    edit: 'Edit',
    deactivate: 'Deactivate',
    activate: 'Activate',
  },
  toast: {
    created: 'Added category "{{name}}"',
    updated: 'Saved category "{{name}}"',
    deactivated: 'Deactivated "{{name}}"',
    activated: 'Activated "{{name}}"',
  },
  form: {
    titleNew: 'Add category',
    titleEdit: 'Edit category',
    description: 'Products choose their category on the product form',
    name: 'Name',
    sortOrder: 'Display order',
    sortOrderHint: 'Lower numbers come first',
    save: 'Save',
    saving: 'Saving…',
  },
} satisfies typeof th

export const locales = { th, en }
