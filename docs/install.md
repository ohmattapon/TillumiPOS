# คู่มือติดตั้ง EasyPOS สำหรับร้านค้า

คู่มือนี้ติดตั้ง EasyPOS ด้วย Docker บนเครื่องของร้านหรือ VPS ด้วยคำสั่งเดียว ข้อมูลทั้งหมดอยู่ในเครื่องของคุณเอง

## สิ่งที่ต้องมี

- เครื่องที่ติดตั้ง **Docker** (บน Windows/macOS ใช้ Docker Desktop) และ Docker Compose
- พื้นที่ว่างอย่างน้อย 2 GB และ RAM อย่างน้อย 1 GB
- ถ้าต้องการใช้ผ่านอินเทอร์เน็ตด้วย HTTPS: โดเมนที่ชี้มาที่เครื่องนี้ และพอร์ต 80 กับ 443 ที่เข้าถึงได้

## ติดตั้ง

ดาวน์โหลดหรือ clone โปรเจกต์ แล้วรันในโฟลเดอร์หลัก:

macOS / Linux:

```sh
scripts/install.sh
```

Windows (PowerShell):

```powershell
.\scripts\install.ps1
```

สคริปต์จะ

1. สร้างไฟล์ `.env` พร้อมรหัสลับที่สุ่มให้ (เก็บไฟล์นี้เป็นความลับ ห้ามส่งให้ใคร)
2. สร้างและเริ่มระบบด้วย Docker (ครั้งแรกใช้เวลาหลายนาที)
3. พิมพ์ที่อยู่เว็บและ **รหัสตั้งค่า** ให้

ถ้ามีไฟล์ `.env` อยู่แล้ว สคริปต์จะเก็บไว้และไม่เขียนทับ

## ตั้งค่าร้านครั้งแรก

1. เปิดที่อยู่ที่สคริปต์พิมพ์ (ปกติ `http://localhost:3000`)
2. กรอก **รหัสตั้งค่า** ที่สคริปต์พิมพ์ให้ ชื่อร้าน ชื่อสาขาแรก และบัญชีเจ้าของ (รหัสผ่านอย่างน้อย 10 ตัวอักษร)
3. กด "ตั้งค่าและเข้าสู่ระบบ" ระบบจะพาเข้าหน้าขาย

ถ้าลืมรหัสตั้งค่า (ก่อนตั้งค่าเสร็จ) ดูรหัสได้จาก log หรือรีสตาร์ทเพื่อรับรหัสใหม่:

```sh
docker compose logs app
docker compose restart app
```

รหัสตั้งค่าใช้ได้ครั้งเดียว กรอกผิด 5 ครั้งจะถูกล็อก 15 นาที หลังตั้งค่าเสร็จหน้านี้ใช้อีกไม่ได้

## ใช้ผ่านอินเทอร์เน็ตด้วย HTTPS

```sh
scripts/install.sh --domain pos.ร้านของคุณ.com
```

(Windows: `.\scripts\install.ps1 -Domain ...`) ระบบจะขอและต่ออายุใบรับรองให้เอง ถ้าติดตั้งไปแล้ว ให้ใส่ `DOMAIN=` และ `COOKIE_SECURE=true` ใน `.env` แล้วรัน `docker compose --profile https up -d`

## สำรองข้อมูล

```sh
scripts/backup.sh
```

ได้ไฟล์ `backups/easypos-วันที่-เวลา.sql.gz` (Windows: `.\scripts\backup.ps1`) **เก็บสำเนาไว้นอกเครื่องนี้ด้วย** เช่นดิสก์อีกลูกหรือ cloud drive

ควรตั้งให้สำรองทุกคืน: บน Linux ใช้ cron (`0 2 * * * cd /path/to/easypos && scripts/backup.sh`) บน Windows ใช้ Task Scheduler เรียก `backup.ps1`

รูปสินค้าที่เก็บบน Cloudflare R2 ไม่อยู่ในไฟล์สำรองนี้

## กู้คืนข้อมูล

```sh
scripts/restore.sh backups/easypos-20261014-210000.sql.gz
```

(Windows: `.\scripts\restore.ps1 backups\...`) **คำสั่งนี้แทนที่ข้อมูลทั้งหมด** จะถามให้พิมพ์ `YES` ก่อน

## อัปเดตเวอร์ชัน

```sh
scripts/backup.sh
git pull
docker compose up -d --build
```

ระบบปรับโครงสร้างฐานข้อมูลให้เองตอนเริ่ม

## ตั้งค่าเพิ่มเติม (ไฟล์ `.env`)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `PORT` | พอร์ตของเว็บ (ค่าเริ่มต้น 3000) |
| `DOMAIN`, `COOKIE_SECURE` | เปิด HTTPS (ดูหัวข้อด้านบน) |
| `MEDIA_URL`, `MEDIA_TOKEN` | เปิดรูปสินค้า (ต้องมี Cloudflare Worker ของ `apps/media`) ถ้าเว้นว่าง ระบบทำงานได้โดยไม่มีรูป |
| `SCB_API_KEY`, `SCB_API_SECRET`, `SCB_BILLER_ID`, `SCB_REF3_PREFIX` | เปิดการชำระ QR ของ SCB ตั้งค่าและทดสอบกับธนาคารก่อนใช้จริง |
| `SCB_API_BASE_URL` | ที่อยู่ API ของ SCB ค่าเริ่มต้นเป็น sandbox: ตอนใช้จริงต้องเปลี่ยนเป็นที่อยู่ production ที่ SCB ให้มาพร้อมกุญแจ |

แก้ `.env` แล้วรัน `docker compose up -d` เพื่อให้มีผล

## แก้ปัญหา

| อาการ | ทางแก้ |
|---|---|
| เปิดเว็บไม่ได้ | `docker compose ps` ดูว่า `app` และ `db` ทำงานอยู่ และ `docker compose logs app` ดูข้อความผิดพลาด |
| พอร์ต 3000 ถูกใช้อยู่ | ตั้ง `PORT=` ใน `.env` เป็นเลขอื่นแล้ว `docker compose up -d` |
| ไม่เห็นรหัสตั้งค่า | `docker compose logs app` แล้วหา `SETUP CODE` หรือ `docker compose restart app` |
| ต้องการเริ่มใหม่หมด (ลบข้อมูลทั้งหมด) | `docker compose down -v` แล้วลบ `.env` แล้วรันติดตั้งใหม่ ข้อมูลทั้งหมดจะหายถาวร |

## ใบอนุญาต

AGPL-3.0 ดูไฟล์ `LICENSE`
