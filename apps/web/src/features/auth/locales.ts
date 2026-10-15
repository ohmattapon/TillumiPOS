const th = {
  title: 'เข้าสู่ระบบ',
  subtitle: 'กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเริ่มขาย',
  username: 'ชื่อผู้ใช้',
  password: 'รหัสผ่าน',
  showPassword: 'แสดงรหัส',
  submit: 'เข้าสู่ระบบ',
  submitting: 'กำลังเข้าสู่ระบบ…',
  forgotPassword: 'ลืมรหัสผ่าน ให้เจ้าของร้านตั้งรหัสใหม่ให้',
  brand: {
    imageAlt: 'หน้าจอเครื่องขาย TillumiPOS',
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
  brand: {
    imageAlt: 'TillumiPOS on a point-of-sale screen',
    headline: 'Point of sale that works with a mouse, a keyboard or a touch screen',
    sales: 'Sales and payments',
    stock: 'Products and stock',
    tables: 'Tables and orders',
    shifts: 'Shifts and the cash drawer',
  },
} satisfies typeof th

export const locales = { th, en }
