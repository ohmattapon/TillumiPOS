const th = {
  title: 'ผู้ใช้',
  description: '{{items}} · แต่ละคนเข้าระบบด้วยบัญชีของตัวเอง',
  add: 'เพิ่มผู้ใช้',
  list: {
    title: 'รายชื่อผู้ใช้',
    description: 'ชื่อผู้ใช้แก้ภายหลังไม่ได้ ผู้ใช้ที่ปิดใช้งานจะเข้าระบบไม่ได้ทันที',
    empty: 'ยังไม่มีผู้ใช้',
  },
  columns: {
    name: 'ชื่อ',
    username: 'ชื่อผู้ใช้',
    role: 'บทบาท',
    status: 'สถานะ',
    actions: 'การทำงาน',
  },
  roles: {
    owner: 'เจ้าของร้าน',
    cashier: 'แคชเชียร์',
  },
  status: {
    active: 'ใช้งานได้',
    inactive: 'ปิดใช้งาน',
  },
  you: 'คุณ',
  actions: {
    more: 'การทำงานอื่นของ {{name}}',
    edit: 'แก้ไข',
    deactivate: 'ปิดใช้งาน',
    activate: 'เปิดใช้งาน',
  },
  toast: {
    created: 'เพิ่มผู้ใช้ "{{name}}" แล้ว',
    updated: 'บันทึก "{{name}}" แล้ว',
    deactivated: 'ปิดใช้งาน "{{name}}" แล้ว',
    activated: 'เปิดใช้งาน "{{name}}" แล้ว',
  },
  form: {
    titleNew: 'เพิ่มผู้ใช้',
    titleEdit: 'แก้ไขผู้ใช้',
    descriptionNew: 'แจ้งชื่อผู้ใช้และรหัสผ่านให้พนักงานด้วยตัวเอง ระบบไม่ส่งให้',
    descriptionEdit: 'เว้นรหัสผ่านว่างไว้ถ้าไม่ต้องการเปลี่ยน',
    username: 'ชื่อผู้ใช้',
    usernameHint: 'a-z 0-9 _ . - ยาว 3 ถึง 32 ตัว',
    displayName: 'ชื่อที่แสดงบนใบเสร็จ',
    role: 'บทบาท',
    password: 'รหัสผ่าน',
    newPassword: 'รหัสผ่านใหม่',
    passwordHint: 'อย่างน้อย 8 ตัวอักษร',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
}

const en = {
  title: 'Users',
  description: '{{items}} · everyone signs in with their own account',
  add: 'Add user',
  list: {
    title: 'Users',
    description: 'A username cannot be changed later. A deactivated user is signed out at once.',
    empty: 'No users yet',
  },
  columns: {
    name: 'Name',
    username: 'Username',
    role: 'Role',
    status: 'Status',
    actions: 'Actions',
  },
  roles: {
    owner: 'Owner',
    cashier: 'Cashier',
  },
  status: {
    active: 'Active',
    inactive: 'Deactivated',
  },
  you: 'you',
  actions: {
    more: 'More actions for {{name}}',
    edit: 'Edit',
    deactivate: 'Deactivate',
    activate: 'Activate',
  },
  toast: {
    created: 'Added user "{{name}}"',
    updated: 'Saved "{{name}}"',
    deactivated: 'Deactivated "{{name}}"',
    activated: 'Activated "{{name}}"',
  },
  form: {
    titleNew: 'Add user',
    titleEdit: 'Edit user',
    descriptionNew: 'Give the username and password to the person yourself. The system does not send them.',
    descriptionEdit: 'Leave the password empty to keep the current one',
    username: 'Username',
    usernameHint: 'a-z 0-9 _ . -, 3 to 32 characters',
    displayName: 'Name shown on receipts',
    role: 'Role',
    password: 'Password',
    newPassword: 'New password',
    passwordHint: 'At least 8 characters',
    save: 'Save',
    saving: 'Saving…',
  },
} satisfies typeof th

export const locales = { th, en }
