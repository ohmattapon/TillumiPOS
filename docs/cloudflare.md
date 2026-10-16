# รัน TillumiPOS บน Cloudflare

ทางเลือกนี้ไม่ต้องมีเครื่องหรือ VPS ของตัวเอง Worker ใน `apps/cloud` ส่งทุก request ไปยัง Cloudflare Container ตัวเดียว ที่รัน image จาก `Dockerfile` ของ repo (API และหน้าเว็บอยู่ใน image เดียวกัน) ส่วนรูปสินค้าเก็บใน R2 ผ่าน Worker ใน `apps/media`

## สิ่งที่ต้องมี

- บัญชี Cloudflare แผน **Workers Paid** (Containers ใช้กับแผนฟรีไม่ได้)
- PostgreSQL ที่เข้าถึงได้จากอินเทอร์เน็ต เช่น Neon, Aiven, Supabase (ระบบไม่ได้สร้างฐานข้อมูลให้)
- R2 bucket ชื่อ `pos-media` และ Worker `pos-media` จาก `apps/media` ที่ตั้ง secret `MEDIA_TOKEN` แล้ว

## ข้อจำกัด

- มี container เพียงตัวเดียว (`max_instances: 1`) เพราะ API เก็บการจับคู่จอลูกค้าไว้ในหน่วยความจำ
- container หลับเมื่อไม่มีคนใช้ 30 นาที request แรกหลังจากนั้นรอหลายวินาที และการจับคู่จอลูกค้าต้องทำใหม่
- ดิสก์ของ container หายเมื่อหลับ จึงต้องเก็บรูปผ่าน Worker เท่านั้น (`MEDIA_STORAGE=worker`)
- migration รันทุกครั้งที่ container เริ่ม (ส่วนที่รันแล้วถูกข้าม)

## ตั้งค่าครั้งแรก

1. Worker เก็บรูป (ครั้งเดียว):

   ```bash
   cd apps/media
   bunx wrangler r2 bucket create pos-media
   bunx wrangler secret put MEDIA_TOKEN      # ค่าสุ่มยาว ๆ จดไว้ใช้ในข้อ 2
   bunx wrangler deploy
   ```

2. ตั้ง secret ของ Worker `tillumipos` (ใน dashboard: Workers & Pages → tillumipos → Settings → Variables and Secrets หรือ `bunx wrangler secret put <ชื่อ>` ใน `apps/cloud`):

   | ชื่อ | ค่า |
   |---|---|
   | `DATABASE_URL` | URL ของ PostgreSQL พร้อม `?sslmode=require` |
   | `JWT_SECRET` | ค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร |
   | `MEDIA_URL` | URL ของ Worker `pos-media` เช่น `https://pos-media.<subdomain>.workers.dev` |
   | `MEDIA_TOKEN` | ค่าเดียวกับข้อ 1 |

3. ใน Workers Builds ของ project `tillumipos` (Settings → Build):
   - Build variable `BUN_VERSION` = เวอร์ชันเดียวกับที่สร้าง `bun.lock` (`bun --version`)
   - Deploy command: `cd apps/cloud && bun run deploy`

   Workers Builds มี Docker จึงสร้าง image ให้เอง ถ้า deploy จากเครื่องตัวเองต้องเปิด Docker ไว้

4. เปิด `https://tillumipos.<subdomain>.workers.dev` ถ้าฐานข้อมูลยังว่าง จะเห็นหน้าตั้งค่าครั้งแรก รหัสตั้งค่าอยู่ใน log ของ container (dashboard → tillumipos → Containers → Logs)
