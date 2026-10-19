<h1 align="center">
  <img src="docs/brand/logo-with-white.jpg" alt="TillumiPOS" width="360" />
</h1>

<p align="center">
  ระบบขายหน้าร้านสำหรับร้านค้าปลีก คาเฟ่ และร้านอาหาร แบบร้านเดียวสาขาเดียว
</p>

<p align="center">
  <img alt="Bun 1.4.3" src="https://img.shields.io/badge/Bun-1.4.3-000000?logo=bun&logoColor=white" />
  <img alt="Elysia API" src="https://img.shields.io/badge/API-Elysia-6B46C1?logo=elysia&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/Web-React%2019-149ECA?logo=react&logoColor=white" />
  <img alt="PostgreSQL 17" src="https://img.shields.io/badge/Database-PostgreSQL%2017-4169E1?logo=postgresql&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" />
</p>

TillumiPOS รวมงานขาย การจัดการสินค้าและสต็อก ออเดอร์สำหรับร้านอาหาร และการดูแลกะไว้ในระบบเดียว หน้าจอรองรับภาษาไทยและอังกฤษ ส่วน API แยกกฎธุรกิจออกจากฐานข้อมูลและเว็บไคลเอนต์

## ความสามารถ

| | |
|---|---|
| **ขายหน้าร้าน** | ค้นหาหรือสแกนสินค้า ใช้ส่วนลด รับชำระเงินสด พร้อมเพย์ หรือบัตร และพิมพ์ใบเสร็จ |
| **ออเดอร์และโต๊ะ** | เปิดออเดอร์ค้าง ผูกกับโต๊ะ ย้ายโต๊ะ รวมออเดอร์ และแยกบิลตามรายการ |
| **ตัวเลือกสินค้า** | ตั้งกลุ่มตัวเลือก เช่น ความหวานหรือท็อปปิง เพิ่มราคาและต้นทุน แล้วเลือกตอนขาย |
| **สินค้าและสต็อก** | จัดการสินค้าทั่วไปและเมนูคาเฟ่ หมวดหมู่ รูปภาพ สร้าง SKU อัตโนมัติเมื่อเว้นว่าง และปรับยอด |
| **ใบรับสินค้าเข้า** | รับสินค้าหลายรายการในใบเดียว เก็บร่างไว้แม้รีโหลดหน้า ส่งซ้ำได้โดยไม่เพิ่มสต็อกซ้ำ และดูประวัติใบรับเข้า |
| **เมนูคาเฟ่** | เพิ่มเมนูเริ่มต้น แล้วแก้ชื่อ ราคา และตัวเลือกให้เหมาะกับร้าน |
| **สมาชิกและโปรโมชัน** | จัดการสมาชิก ดูประวัติซื้อ และตั้งส่วนลดตามเงื่อนไขหรือช่วงเวลา |
| **กะและเงินสด** | จัดการเครื่องคิดเงิน เปิดกะ บันทึกเงินเข้าออก นับเงินปิดกะ และดูรายงานกะ |
| **จอลูกค้า** | แสดงสินค้า ยอดชำระ และสไลด์ประชาสัมพันธ์ จับคู่จอด้วยรหัส หรือใช้จอในเบราว์เซอร์เดียวกัน |
| **พนักงานและสิทธิ์** | ตั้งบทบาทและสิทธิ์ สลับพนักงานด้วย PIN จากเครื่องที่ลงชื่อเข้าใช้แล้ว และดูบันทึกการทำงาน |
| **รายงาน** | ดูยอดขายย้อนหลัง รายงานสินค้าและการรับชำระ พร้อมส่งออกรายงาน |
| **QR ของ SCB** | สร้าง QR และตรวจสถานะการชำระกับ SCB; ต้องตั้งค่าข้อมูลร้านค้าและทดสอบการชำระจริงก่อนเปิดใช้ |
| **QR พร้อมเพย์แบบคงที่** | กรอกเบอร์มือถือ/เลขบัตรครั้งเดียวที่หน้าตั้งค่าร้าน แล้วแสดง QR ฝังยอดตามบิลให้ลูกค้าสแกน; พนักงานต้องตรวจยอดเงินเข้าที่แอปธนาคารเองแล้วกดยืนยันใน POS |
| **ตั้งค่าร้าน** | ตั้งชื่อร้าน ข้อมูลใบเสร็จ สกุลเงิน ภาษี เขตเวลา และภาษาของหน้าจอ |

ระบบใช้สาขา `MAIN` เพียงสาขาเดียว ไม่มีหน้าสร้างหรือสลับสาขา หน้าจอรองรับมือถือ แท็บเล็ต และเดสก์ท็อป และเลือกแสดงความสามารถให้เหมาะกับประเภทร้านได้

### ขอบเขตปัจจุบัน

- ใบรับสินค้าเข้ายังไม่มีผู้จำหน่าย ล็อต วันหมดอายุ หรือการเฉลี่ยต้นทุน และยังไม่มีการนับสต็อกเป็นรอบ
- ประวัติการเคลื่อนไหวของสต็อกมีผ่าน API; หน้าประวัติการเคลื่อนไหวโดยเฉพาะยังไม่มี
- การรับชำระบัตรเป็นการบันทึกประเภทการชำระ ยังไม่มีการเชื่อมต่อเครื่องรูดบัตรในระบบ
- SCB QR ต้องใช้ข้อมูลร้านค้าจริงและทดสอบกับธนาคารก่อนใช้งานจริง เมื่อยังไม่ตั้งค่า SCB การบันทึกพร้อมเพย์ต้องอาศัยพนักงานตรวจยอดเอง
- สถานะจับคู่จอลูกค้าและตัวนับความพยายาม PIN อยู่ในหน่วยความจำของ API จึงออกแบบสำหรับ API หนึ่ง instance

## โครงสร้างระบบ

```mermaid
flowchart LR
    Web["Web · React + Eden"] -->|"/api/v1, /api/v2"| API["API · Bun + Elysia"]
    API --> DB[("PostgreSQL · Drizzle")]
    API --> Local["รูปสินค้าในดิสก์ · local"]
    API --> Media["รูปสินค้าผ่าน Media Worker · worker"]
    Media --> R2[("Cloudflare R2")]
```

| โฟลเดอร์ | หน้าที่และเทคโนโลยี |
|---|---|
| `src/` (ที่ root) | React, Vite, Tailwind, shadcn/ui, TanStack Query และ Zustand; เรียก API ผ่าน Elysia Eden ที่ใช้ type จากฝั่งเซิร์ฟเวอร์ |
| `server/` | Bun, Elysia, Drizzle, PostgreSQL, tsyringe และ Zod; จัดโค้ดตาม Hexagonal Architecture และ CQRS |
| `workers/media` | Cloudflare Worker สำหรับเก็บและให้บริการรูปสินค้าผ่าน R2 |
| `workers/cloud` | ตัวเลือก deploy API และเว็บผ่าน Cloudflare Container; ต้องตั้งค่าบริการเพิ่มเติม |
| `drizzle/` | Migration ของฐานข้อมูล |
| `e2e/` | ทดสอบผ่าน Chrome และเก็บภาพหน้าจอด้วยฐานข้อมูลแยก |
| `scripts/` | ติดตั้ง สำรอง และกู้คืนระบบด้วย Podman |

API ใช้ `/api/v1` และ `/api/v2` สำหรับงาน checkout/กะรุ่นใหม่ รูปสินค้าเลือกเก็บในดิสก์ (`local`), Cloudflare R2 ผ่าน Worker (`worker`) หรือปิดรูปภาพ (`none`) ได้ ไม่จำเป็นต้องใช้ Cloudflare เมื่อติดตั้งในร้าน

## ติดตั้งสำหรับร้านค้า

เส้นทางติดตั้งที่รองรับในปัจจุบันคือ **Windows 11 + WSL2 + Podman** ไม่ต้องใช้ Docker Desktop สคริปต์จะเตรียม Podman และ Compose provider ให้เมื่อยังไม่มี โดยยังใช้ชื่อไฟล์ `docker-compose.yml` ตามเดิม

เปิด PowerShell ในโฟลเดอร์โปรเจกต์:

```powershell
.\scripts\install.ps1
```

สคริปต์สร้าง `.env` พร้อมรหัสลับแบบสุ่ม เริ่มฐานข้อมูลและแอป แล้วแสดงที่อยู่เว็บกับ **รหัสตั้งค่า** หากมี `.env` อยู่แล้วจะใช้ไฟล์เดิม เมื่อเปิดเว็บครั้งแรก ให้กรอกรหัสตั้งค่าและสร้างบัญชีเจ้าของร้านเอง ไม่มีบัญชีเริ่มต้นจากขั้นตอนติดตั้งนี้

รหัสตั้งค่าดูได้จาก log ของแอป ไม่ได้ส่งผ่าน API เมื่อฐานข้อมูลมีผู้ใช้อยู่แล้วจะเป็นหน้าลงชื่อเข้าใช้ตามปกติ แอปใน container รัน migration ก่อนเริ่ม API และให้บริการเว็บที่ build แล้วผ่านพอร์ตเดียว ปกติคือ `http://localhost:3000`

ดูรายละเอียด การใช้ HTTPS การอัปเดต และการย้ายเครื่องใน [คู่มือติดตั้ง](docs/install.md) ถ้าจะใช้ iPad แท็บเล็ต หรือเครื่องอื่นเป็นหน้าจอ ดู [คู่มือตั้งอุปกรณ์](docs/devices.md) สคริปต์ `.sh` (macOS และ Linux) มีอยู่ใน repo แต่ยังไม่ได้ทดสอบบนเครื่องจริง

สำรองและกู้คืนข้อมูลของการติดตั้งแบบนี้:

```powershell
.\scripts\backup.ps1
.\scripts\restore.ps1 backups\easypos-YYYYMMDD-HHMMSS.sql.gz
```

เปลี่ยนชื่อไฟล์ตัวอย่างเป็นไฟล์สำรองจริง การสำรองรวมฐานข้อมูลและรูปในดิสก์เป็นไฟล์คู่กัน ส่วนการกู้คืนแทนที่ข้อมูลเดิมและต้องยืนยันก่อนทำงาน

## รันเพื่อพัฒนา

ต้องมี [Bun](https://bun.sh/) รุ่นตาม badge ด้านบน, Podman และ Compose provider บน Windows ให้เตรียม Podman machine ให้ทำงานก่อนเริ่มฐานข้อมูล

ติดตั้ง dependencies และคัดลอกไฟล์ตั้งค่า หากยังไม่มี `.env`:

```powershell
bun install
Copy-Item .env.example .env
```

สำหรับฐานพัฒนาใหม่ที่ใช้ค่าท้องถิ่นของชุดทดสอบ ให้ตั้งค่าต่อไปนี้ใน `.env`:

```dotenv
POSTGRES_PASSWORD=pos
DATABASE_URL=postgres://pos:pos@localhost:5433/pos
MEDIA_STORAGE=local
CHECKOUT_MODE=legacy
```

ค่ารหัสฐานข้อมูลข้างต้นใช้สำหรับเครื่องพัฒนาเท่านั้น หากใช้ฐานข้อมูลเดิม ให้ใช้รหัสและพอร์ตของฐานนั้น ค่า `POSTGRES_PASSWORD` ของ container กับรหัสใน `DATABASE_URL` ต้องตรงกัน และเปลี่ยน `JWT_SECRET` จากค่าตัวอย่างเป็นค่าที่สร้างเอง เช่น:

```sh
bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

ค่า SCB ที่ขึ้นต้นด้วย `your-` คงไว้ได้เมื่อยังไม่ใช้ธนาคาร ส่วน `MEDIA_STORAGE=local` ไม่ต้องตั้งค่า Worker หรือ R2

เริ่มฐานข้อมูลและรัน migration จากโฟลเดอร์หลัก:

```sh
bun run db:up
bun run db:migrate
```

เปิด API และเว็บในคนละ terminal:

```sh
bun run dev:api
```

```sh
bun run dev:web
```

จากนั้นเปิดเว็บและสร้างบัญชีเจ้าของร้านผ่านหน้า setup โดยใช้รหัสจาก terminal ของ API

หากต้องการข้อมูลตัวอย่างสำหรับพัฒนา **แทนการทำ setup** ให้ตั้ง `SEED_OWNER_PASSWORD` เป็นรหัสที่เลือกเอง แล้วรัน `bun run db:seed` ก่อนสร้างผู้ใช้ใด ๆ คำสั่งนี้สร้างบัญชี `admin` หมวดหมู่ และสินค้าตัวอย่าง หากมีผู้ใช้อยู่แล้วจะข้ามทั้งหมด ใช้เฉพาะฐานพัฒนาหรือฐานสาธิต

มีคำสั่งเติมข้อมูลสาธิตอีกสองคำสั่ง ใช้เฉพาะฐานสาธิต:

- `bun run db:seed:demo` ใส่ข้อมูลย้อนหลัง 3 สัปดาห์จนถึงปัจจุบัน (บิล กะ ลิ้นชัก สต็อก ออเดอร์โต๊ะ และ QR) ต้องรัน `db:seed` ก่อน และหยุดเองหากฐานมีบิลอยู่แล้ว
- `bun run db:seed:catalog` นำเข้าแคตตาล็อกสินค้าตัวอย่างจาก Open Food Facts ต้องมีบัญชีเจ้าของร้านก่อน (จากหน้า setup หรือ `db:seed`) ดูที่มาและสัญญาอนุญาตใน [`docs/demo-product-catalog.md`](docs/demo-product-catalog.md)

เมื่อบริการเริ่มทำงานแล้ว:

| บริการ | ที่อยู่ในเครื่อง |
|---|---|
| เว็บ | `http://localhost:5173` |
| API | `http://localhost:3000/api/v1` |
| API docs | `http://localhost:3000/openapi` |
| PostgreSQL สำหรับพัฒนา | `localhost:5433` |
| Media Worker (เมื่อเลือกใช้) | `http://localhost:8787` |

Vite ส่งต่อ `/api`, `/openapi` และ `/media` ไปยัง API โดยอัตโนมัติ ตั้ง `API_TARGET` ได้หาก API ใช้พอร์ตอื่น

`bun run dev` เป็นทางลัดเปิด API, เว็บ และ Media Worker พร้อมกัน หากใช้รูปในดิสก์ไม่จำเป็นต้องเปิด Worker ส่วน Redis เป็น cache เสริม เปิดได้ด้วย `bun run cache:up` และตั้ง `REDIS_URL` ตาม `.env.example`; ไม่ตั้งค่าก็รัน API ได้

### โหมดกะ

ไฟล์ `.env.example` ใช้ `CHECKOUT_MODE=legacy` ส่วนตัวติดตั้งร้านสร้างค่า `shifts` ให้ร้านใหม่ ก่อนเปลี่ยนร้านเดิมไปใช้ `shifts` ให้ทำตาม [คู่มือ cash shift cutover](docs/cash-shift-cutover.md) โดยเฉพาะการตรวจฐานข้อมูลและ QR ที่ค้างอยู่

## ตรวจโค้ด

```sh
bun run typecheck
bun run lint
bun run test:unit
bun run test
bun run e2e
bun run screenshots
bun run build
```

`test` รัน API และเว็บ รวม integration tests ที่ใช้ PostgreSQL จริงตาม `server/.env.test` (`pos_test` ที่ `localhost:5433`) ส่วน `test:unit` เลือกเฉพาะ `domains`, `libs` และ `modules` แต่ปัจจุบันมี repository tests อยู่ใน `modules` ด้วย จึงยังต้องเตรียม PostgreSQL สำหรับคำสั่งนี้เช่นกัน หากต้องการทดสอบเฉพาะเว็บโดยไม่ใช้ฐานข้อมูล ให้รัน `bun run test:web`

ชุดทดสอบสร้าง `pos_test` ให้เมื่อยังไม่มี และล้างข้อมูลในฐานนี้ระหว่างทดสอบ จึงต้องแยกจากฐานร้านเสมอ

E2E และ screenshots ใช้ Chrome และเริ่ม API/เว็บของตัวเอง โดยลบแล้วสร้างฐาน `pos_e2e`, `pos_e2e_setup` และ `pos_e2e_shots` ตามลำดับ ห้ามใช้ชื่อเหล่านี้เก็บข้อมูลร้าน ภาพหน้าจออยู่ใน `screenshots/` ที่ไม่ถูก commit ครอบคลุม 390×844, 390×500, 768×1024 และ 1366×900

ตรวจสัญญา OpenAPI:

```sh
bun run openapi:check
```

## การตั้งค่าที่เกี่ยวกับความลับ

- เก็บค่าจริงใน `.env` ที่ root ของ repo; ห้ามใส่ credentials ใน `.env.example`, โค้ด หรือไฟล์ที่ commit
- `.env.example` ใช้สำหรับแสดงชื่อตัวแปรและค่าตัวอย่างเท่านั้น
- เมื่อใช้ `MEDIA_STORAGE=worker` ต้องตั้ง `MEDIA_URL` และ `MEDIA_TOKEN` ให้ตรงกับ Worker ตอน deploy ให้ตั้ง secret ของ Worker ด้วย `wrangler secret put MEDIA_TOKEN`
- หากไม่ระบุ `MEDIA_STORAGE` ระบบเลือก `worker` เมื่อมีทั้ง `MEDIA_URL` และ `MEDIA_TOKEN` มิฉะนั้นเลือก `local`; ตั้ง `none` เพื่อปิดรูปสินค้า
- SCB QR ใช้ค่า `SCB_API_KEY`, `SCB_API_SECRET`, `SCB_BILLER_ID` และ `SCB_REF3_PREFIX`; production ต้องกำหนด base URL ที่ SCB แจ้งให้ร้าน
- การทดสอบ SCB ใช้เซิร์ฟเวอร์จำลองใน repo อย่าตั้งชุดทดสอบให้เรียกธนาคารจริง

## เอกสารใน repo

| เอกสาร | ใช้ดูเรื่อง |
|---|---|
| [`AGENTS.md`](AGENTS.md) | ข้อตกลงการพัฒนา โครงสร้าง API และเว็บ การทำงานกับ branch และความลับ |
| [`DESIGN.md`](DESIGN.md) | แนวทางออกแบบหน้าจอและการโต้ตอบ |
| [`docs/install.md`](docs/install.md) | ติดตั้ง อัปเดต สำรอง และกู้คืนระบบสำหรับร้านค้า |
| [`docs/devices.md`](docs/devices.md) | ตั้งเครื่องหลักและ iPad แท็บเล็ต เครื่อง POS ในร้านทีละอุปกรณ์ |
| [`docs/superpowers/roadmap.md`](docs/superpowers/roadmap.md) | ลำดับความสามารถและงานที่วางแผนไว้ |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | รายละเอียดการออกแบบรายความสามารถ |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | แผนงานสำหรับการพัฒนา |
| [`docs/cash-shift-cutover.md`](docs/cash-shift-cutover.md) | ข้อควรตรวจสอบก่อนเปิดโหมดกะ |
| [`docs/cloudflare.md`](docs/cloudflare.md) | รัน API และเว็บบน Cloudflare Container ผ่าน `workers/cloud` |
| [`docs/redis-cache.md`](docs/redis-cache.md) | เปิดใช้ Redis cache ตอนพัฒนาและในการติดตั้ง |
| [`docs/sales-reports.md`](docs/sales-reports.md) | ความหมายของตัวเลขในหน้ารายงานย้อนหลัง |

Roadmap และแผนงานอาจมีทั้งงานที่เสร็จแล้วและงานที่ยังไม่ได้รวมเข้า `main`
