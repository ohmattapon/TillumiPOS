const th = {
  title: 'ตั้งค่าร้านครั้งแรก',
  subtitle: 'สร้างบัญชีเจ้าของร้านและตั้งชื่อร้าน',
  codeNote: 'รหัสตั้งค่าแสดงอยู่ใน log ของระบบ: รัน "docker compose logs app" แล้วมองหา SETUP CODE',
  setupCode: 'รหัสตั้งค่า',
  shopName: 'ชื่อร้าน',
  branchName: 'ชื่อสาขาแรก',
  username: 'ชื่อผู้ใช้ของเจ้าของ',
  displayName: 'ชื่อที่แสดง',
  password: 'รหัสผ่าน',
  passwordHint: 'อย่างน้อย 10 ตัวอักษร',
  confirm: 'ยืนยันรหัสผ่าน',
  mismatch: 'รหัสผ่านสองช่องไม่ตรงกัน',
  submit: 'ตั้งค่าและเข้าสู่ระบบ',
  submitting: 'กำลังตั้งค่า…',
}

const en = {
  title: 'First-time setup',
  subtitle: 'Create the owner account and name the shop',
  codeNote: 'The setup code is in the system log: run "docker compose logs app" and look for SETUP CODE',
  setupCode: 'Setup code',
  shopName: 'Shop name',
  branchName: 'First branch name',
  username: 'Owner username',
  displayName: 'Display name',
  password: 'Password',
  passwordHint: 'At least 10 characters',
  confirm: 'Confirm password',
  mismatch: 'The two passwords do not match',
  submit: 'Set up and sign in',
  submitting: 'Setting up…',
} satisfies typeof th

export const locales = { th, en }
