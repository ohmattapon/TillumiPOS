# Redis cache

Redis ลดการอ่านซ้ำของรายการสินค้า หมวดหมู่ กลุ่มตัวเลือกเสริม และตั้งค่าร้าน ทุก instance ของ API ที่ใช้ฐานข้อมูลกับ key prefix เดียวกันแชร์ cache ชุดเดียวกัน

## เปิดใช้ตอนพัฒนา

เปิด Redis จาก root ของโครงการ:

```powershell
bun run cache:up
```

เพิ่มใน `.env` ที่ root แล้วเปิด API ใหม่:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
CACHE_TIMEOUT_MS=300
```

ถ้าพอร์ต 6379 ถูกใช้อยู่ เปลี่ยน `REDIS_PORT` และพอร์ตใน `REDIS_URL` ให้ตรงกัน การเชื่อมต่อ Redis ไม่มีการเปลี่ยนฐานข้อมูลหรือ seed บัญชี

## Docker และ Redis บน cloud

Docker Compose เปิด Redis 7.4 ภายใน network ของโครงการ แอปใช้ `redis://redis:6379` โดยอัตโนมัติเมื่อไม่ได้กำหนด `REDIS_CONTAINER_URL` ตัวแปรนี้แยกจาก `REDIS_URL` ของ process บน host เพราะ localhost ภายใน container เป็นคนละเครื่องกับ host พอร์ต Redis ไม่เปิดสู่ภายนอกในชุดติดตั้งจริง ไฟล์สำหรับพัฒนาเปิดเฉพาะ 127.0.0.1

ใช้ `rediss://your-username:your-password@your-host:6379` สำหรับบริการที่ใช้ TLS ใส่ค่าจริงใน `.env` เท่านั้น: process บน host ใช้ `REDIS_URL` และแอป Docker ใช้ `REDIS_CONTAINER_URL` สำหรับบริการที่มี latency สูงเพิ่ม `CACHE_TIMEOUT_MS` ได้ถึง 5000 ค่าเริ่มต้น 300 เหมาะกับ Redis ภายในเครื่องหรือ network เดียวกับ API

หากหลายร้านแชร์ Redis ให้ใช้ `CACHE_KEY_PREFIX` แยกกัน ค่าเริ่มต้นใช้ hash ของ host, port และชื่อฐานข้อมูลโดยไม่รวม credentials แนะนำให้เพิ่ม prefix ตามชื่อร้านและ environment ด้วยเมื่อใช้ managed Redis ฐานข้อมูลที่แตกต่างกันจะแยกกันตั้งแต่ค่าเริ่มต้น

Redis ใช้ memory สูงสุด 64 MB และ `allkeys-lru` ไม่มี volume เพราะ cache สร้างใหม่ได้ ไม่ต้องนำ Redis ไปสำรองหรือ restore คู่กับ PostgreSQL คำสั่งที่ account ของ Redis ต้องใช้คือ GET, SET, HGET, HSET, EXPIRE และ EVAL ไม่ต้องมีสิทธิ์ FLUSHDB หรือ KEYS

## ข้อมูลที่ cache

| ข้อมูล | TTL | ล้างเมื่อ |
|---|---:|---|
| รายการสินค้าและสต็อกของแต่ละสาขา | 30 วินาที | สร้างหรือแก้สินค้า เปลี่ยนรูป ตัดหรือคืนสต็อก รับเข้า และปรับยอด |
| หมวดหมู่ | 60 วินาที | สร้างหรือแก้หมวดหมู่ |
| กลุ่มตัวเลือกเสริม พร้อมตัวเลือกและสินค้าที่ผูก | 30 วินาที | แก้กลุ่ม ตัวเลือก หรือการผูกสินค้า |
| ตั้งค่าร้าน | 60 วินาที | บันทึกการตั้งค่า |

คีย์สินค้าแยกตามสาขาและ query ทั้งหมด รวมคำค้น ตัวกรอง limit และ offset Cache เก็บ snapshot และสร้าง entity กลับก่อนคืนผ่าน port เดิม ไม่มีการเปลี่ยนสัญญา HTTP

การขาย ชำระออเดอร์ ตัดสต็อก การล็อกแถว และการอ่านภายใน transaction ใช้ PostgreSQL โดยตรง การตรวจสิทธิ์ ผู้ใช้ สถานะสาขา QR และรายงานกะไม่ใช้ cache นี้

## การล้าง cache และกรณี Redis ล่ม

การเขียนข้อมูลหมุน revision ของกลุ่ม cache หลัง PostgreSQL commit สำเร็จ คำสั่งที่เขียนหลายตารางใน unit of work เดียวรวมการล้างกลุ่มเดียวกันเป็นครั้งเดียว หาก rollback ไม่ล้าง cache

การอ่านและเติม cache ตรวจ revision ด้วย Lua แบบ atomic คำขอเก่าที่อ่านก่อนมีการแก้ข้อมูลจึงไม่เติมผลลัพธ์ทับ cache ของ revision ใหม่ การเติม cache ทำเบื้องหลัง คำตอบจากฐานข้อมูลไม่รอ Redis แม้ Redis ช้าหรือ error ก็ไม่ทำให้คำขอล้มเหลว Revision เป็น UUID เพื่อกัน metadata ที่ถูก eviction แล้วกลับไปใช้ข้อมูลเก่า Payload เกิน 1 MB อ่านจากฐานข้อมูลโดยไม่เก็บใน cache การเชื่อมต่อครั้งแรกของ API แต่ละ process เปลี่ยน revision ด้วย จึงไม่ใช้ cache ก่อน restore หลังสคริปต์ restore เปิด API กลับมา

เมื่อ Redis ใช้ไม่ได้ API อ่าน PostgreSQL ต่อ จำกัดเวลารอ Redis และพักการเชื่อมต่อใหม่ 10 วินาที Log ไม่พิมพ์ URL หรือ password เมื่อเชื่อมต่อกลับได้จะเปลี่ยน revision ก่อนอ่าน cache ชุดเก่า ความผิดพลาดของ cache ไม่ replay การขายหรือเปลี่ยนการขายที่ commit แล้วให้กลายเป็นการขายที่ล้มเหลว

การแก้ฐานข้อมูลโดยตรงขณะ API ทำงาน เช่น SQL ที่รันเอง หรือ `db:seed` จะไม่หมุน revision cache ของข้อมูลนั้นจึงยังเห็นค่าเดิมจนกว่า TTL หมดหรือ API เริ่มใหม่ ให้รีสตาร์ท API หลังแก้ด้วยมือ สคริปต์ restore ทำอยู่แล้ว

หาก instance หนึ่งติดต่อ Redis ไม่ได้แต่ instance อื่นยังใช้ได้ รายการของ instance อื่นอาจเก่าจน TTL หมดเมื่อ invalidation ส่งไม่ถึง ข้อมูลที่ใช้ขายจริงยังอ่านจาก PostgreSQL Redis ไม่ทดแทนฐานข้อมูลและไม่ได้แก้โควตา connection ที่เต็มด้วยตัวเอง

## ปิด cache

ให้ `REDIS_URL` ว่างแล้วเริ่ม API ใหม่:

```dotenv
REDIS_URL=
REDIS_CONTAINER_URL=
```

ไม่ต้องลบคีย์ของร้านอื่นหรือใช้ FLUSHDB

## แหล่งอ้างอิง

- [Bun RedisClient](https://bun.sh/docs/runtime/redis): connection options, TLS และ raw commands
- [Redis scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/): atomic Lua operations
- [Redis eviction](https://redis.io/docs/latest/develop/reference/eviction/): memory limits และ allkeys-lru

## ผลการตรวจงาน

ตรวจบน worktree `ohmattpon/redis-cache` ด้วย Redis 7.4 ในคอนเทนเนอร์ของโครงการนี้ (พอร์ต 6389 ผูกกับ 127.0.0.1) และ PostgreSQL ท้องถิ่นของ `pos_test` (พอร์ต 5433) ไม่ได้แตะฐานข้อมูล cloud

- typecheck, lint, `openapi:check` (v1 และ v2) ผ่าน
- `docker compose config` ผ่านทั้งสองแบบ พอร์ต Redis ของ dev ผูกกับ 127.0.0.1
- Redis จริง ผ่านทั้งหมด: revision ใหม่ให้ค่าว่าง, การเติมด้วย revision ปัจจุบันถูกเก็บ, การเติมด้วย revision เก่าถูกปฏิเสธ, invalidate หมุน revision และซ่อนค่าเดิม, กลุ่มอื่นไม่ถูกล้าง, process ใหม่หมุน revision ตอนเชื่อมต่อครั้งแรก, Redis หยุดแล้ว lookup/store/invalidate คืนผลภายใน 2 ms โดยไม่โยน error, และ Redis กลับมาแล้ว cache ใช้งานได้หลังช่วงพัก 10 วินาที
- การ rollback กับ PostgreSQL จริง ผ่าน: transaction ที่ล้มเหลวไม่ invalidate และแถวถูกยกเลิกจริง, transaction ที่สำเร็จ invalidate ครั้งเดียวหลัง commit (แถวใหม่มองเห็นจากภายนอกแล้ว), และ unit of work ซ้อนกันรวมเป็นการ invalidate ครั้งเดียว
- ชุดทดสอบ API ทั้งหมด (`bun run test` ในแอป API): ปิด cache ผ่าน 957/957 และเปิด cache (`REDIS_URL` ชี้ Redis นี้) ผ่าน 957/957 โดยมี 102 hits ในการรันนั้น
- `resetDatabase` ล้าง cache ของทุกกลุ่มหลัง truncate ด้วยเส้นทางเดียวกับการเขียนที่ commit แล้ว ก่อนหน้านี้การ truncate ด้วย SQL ตรงทำให้ข้อมูลเก่ายังอยู่ใน cache และทำให้การทดสอบหมวดหมู่หนึ่งข้อล้มเหลว
- ชุดทดสอบ web ไม่มีการเปลี่ยนแปลงใน branch นี้

ยังไม่ได้ทำ
- การทดสอบกับ cloud ไม่ได้ทำ: ชุดทดสอบเชื่อมได้เฉพาะ `localhost:5433/pos_test` ตามที่ harness กำหนด
- การรัน Docker app เต็มรูปแบบตาม install kit กับ Redis และการทำงานหลาย instance พร้อมกัน
