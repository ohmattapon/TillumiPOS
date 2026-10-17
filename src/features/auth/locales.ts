const th = {
  title: 'เข้าสู่ระบบ',
  subtitle: 'กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเริ่มขาย',
  username: 'ชื่อผู้ใช้',
  password: 'รหัสผ่าน',
  showPassword: 'แสดงรหัส',
  submit: 'เข้าสู่ระบบ',
  submitting: 'กำลังเข้าสู่ระบบ…',
  forgotPassword: 'ลืมรหัสผ่าน ให้เจ้าของร้านตั้งรหัสใหม่ให้',
  switch: {
    title: 'สลับพนักงาน',
    choose: 'เลือกชื่อของคุณ',
    enterPin: 'ใส่ PIN ของ {{name}}',
    cancel: 'ยกเลิก',
    usePassword: 'เข้าสู่ระบบด้วยรหัสผ่านแทน',
    you: 'คุณ',
    empty: 'ยังไม่มีใครตั้ง PIN ไว้ ให้ตั้งที่หน้าผู้ใช้งาน',
  },
  pin: {
    backspace: 'ลบตัวเลขตัวสุดท้าย',
    submit: 'ยืนยัน',
  },
  brand: {
    imageAlt: 'หน้าจอเครื่องขาย TillumiPOS',
    logoAlt: 'TillumiPOS',
    headline: 'ระบบขายหน้าร้านที่ใช้ได้ทั้งเมาส์ คีย์บอร์ด และจอสัมผัส',
    sales: 'ขายและรับชำระเงิน',
    stock: 'สินค้าและสต็อก',
    tables: 'โต๊ะและออเดอร์',
    shifts: 'กะและเงินในลิ้นชัก',
  },
}

const en = {
  title: 'Sign in',
  subtitle: 'Enter your username and password to start selling',
  username: 'Username',
  password: 'Password',
  showPassword: 'Show password',
  submit: 'Sign in',
  submitting: 'Signing in…',
  forgotPassword: 'Forgot your password? The shop owner can set a new one for you.',
  switch: {
    title: 'Switch staff',
    choose: 'Choose your name',
    enterPin: "Enter {{name}}'s PIN",
    cancel: 'Cancel',
    usePassword: 'Sign in with password instead',
    you: 'You',
    empty: 'No one has set a PIN yet. Set one on the users page.',
  },
  pin: {
    backspace: 'Delete the last digit',
    submit: 'Confirm',
  },
  brand: {
    imageAlt: 'TillumiPOS on a point-of-sale screen',
    logoAlt: 'TillumiPOS',
    headline: 'Point of sale that works with a mouse, a keyboard or a touch screen',
    sales: 'Sales and payments',
    stock: 'Products and stock',
    tables: 'Tables and orders',
    shifts: 'Shifts and the cash drawer',
  },
} satisfies typeof th

export const locales = { th, en }
