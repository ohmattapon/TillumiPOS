const th = {
  title: 'สไลด์จอลูกค้า',
  description: 'รูปที่วนแสดงบนจอลูกค้า เรียงจากลำดับน้อยไปมาก',
  upload: 'อัปโหลดรูป',
  list: {
    title: 'รูปสไลด์ทั้งหมด',
    description: 'รูปที่ปิดไว้จะไม่แสดงบนจอลูกค้า ลบแล้วเอากลับมาไม่ได้',
    empty: 'ยังไม่มีรูปสไลด์ อัปโหลดรูปแรกได้เลย',
  },
  columns: {
    preview: 'รูป',
    noImage: 'ไม่มีรูป',
    sortOrder: 'ลำดับ',
    status: 'สถานะ',
    actions: 'การทำงาน',
  },
  status: {
    active: 'แสดงอยู่',
    inactive: 'ปิดไว้',
  },
  actions: {
    more: 'การทำงานอื่นของรูปที่ {{order}}',
    editOrder: 'แก้ลำดับ',
    deactivate: 'ปิดการแสดง',
    activate: 'เปิดการแสดง',
    delete: 'ลบรูป',
  },
  toast: {
    uploaded: 'อัปโหลดรูปสไลด์แล้ว',
    updated: 'บันทึกสไลด์แล้ว',
    activated: 'เปิดการแสดงรูปแล้ว',
    deactivated: 'ปิดการแสดงรูปแล้ว',
    deleted: 'ลบรูปสไลด์แล้ว',
  },
  error: {
    invalidType: 'ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP',
    tooLarge: 'รูปต้องมีขนาดไม่เกิน 5 MB',
  },
  retry: 'ลองอีกครั้ง',
  form: {
    titleOrder: 'แก้ลำดับการแสดง',
    descriptionOrder: 'เลขน้อยแสดงก่อน รูปที่อัปโหลดใหม่จะไปอยู่ท้ายสุด',
    sortOrder: 'ลำดับการแสดง',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
  confirmDelete: {
    title: 'ลบรูปสไลด์นี้?',
    description: 'รูปจะหายจากจอลูกค้าทันที และเอากลับมาไม่ได้',
    cancel: 'ยกเลิก',
    confirm: 'ลบรูป',
    deleting: 'กำลังลบ…',
  },
}

const en = {
  title: 'Customer display slides',
  description: 'Pictures shown in rotation on the customer display, lowest order first',
  upload: 'Upload picture',
  list: {
    title: 'All slides',
    description: 'Hidden pictures are not shown on the customer display. Deleting cannot be undone.',
    empty: 'No slides yet — upload the first one',
  },
  columns: {
    preview: 'Picture',
    noImage: 'No picture',
    sortOrder: 'Order',
    status: 'Status',
    actions: 'Actions',
  },
  status: {
    active: 'Showing',
    inactive: 'Hidden',
  },
  actions: {
    more: 'More actions for picture {{order}}',
    editOrder: 'Edit order',
    deactivate: 'Hide',
    activate: 'Show',
    delete: 'Delete picture',
  },
  toast: {
    uploaded: 'Slide picture uploaded',
    updated: 'Slide saved',
    activated: 'Picture is now showing',
    deactivated: 'Picture is now hidden',
    deleted: 'Slide picture deleted',
  },
  error: {
    invalidType: 'The file must be a JPEG, PNG or WebP picture',
    tooLarge: 'The picture must be 5 MB or smaller',
  },
  retry: 'Retry',
  form: {
    titleOrder: 'Edit display order',
    descriptionOrder: 'Lower numbers come first. Newly uploaded pictures go last.',
    sortOrder: 'Display order',
    save: 'Save',
    saving: 'Saving…',
  },
  confirmDelete: {
    title: 'Delete this slide picture?',
    description: 'It disappears from the customer display at once and cannot be recovered.',
    cancel: 'Cancel',
    confirm: 'Delete picture',
    deleting: 'Deleting…',
  },
} satisfies typeof th

export const locales = { th, en }
