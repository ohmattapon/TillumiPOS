# Redis read cache

## ขอบเขตที่อนุมัติ

เพิ่ม Redis ใน worktree แยกจาก main บน `ohmattpon/redis-cache` ตามคำอนุญาตของเจ้าของโครงการ ใช้ cache สำหรับรายการสินค้า หมวดหมู่ กลุ่มตัวเลือกเสริม และตั้งค่าร้าน

ใช้ Bun RedisClient หลัง port ร่วม และ repository decorator ภายในแต่ละโมดูล Use case และ domain ไม่รับรู้ Redis การเขียน cache เป็นรายละเอียดของ read adapter และไม่เปลี่ยนสถานะทางธุรกิจของ query

## ทางเลือกและการตัดสินใจ

1. **แนะนำ: cache ใน read adapter** ควบคุมการแปลง snapshot กลับเป็น entity และข้าม cache ใน transaction ได้ ใช้กับข้อมูลที่อ่านบ่อยตามขอบเขตนี้
2. Cache คำตอบ HTTP ทั้งเส้นทาง: ติดตั้งง่าย แต่ต้องจัดการสิทธิ์ คีย์สาขา และข้อมูลที่คำสั่งภายในระบบยังอ่านจากฐานข้อมูล
3. ใช้ Redis เป็น session store ด้วย: เป็นงานแยกที่เปลี่ยนการตรวจสิทธิ์และการออกจากระบบ ไม่อยู่ในงานนี้

## ความถูกต้อง

- TTL สินค้าและ modifiers 30 วินาที หมวดหมู่และตั้งค่า 60 วินาที
- สินค้าแยกคีย์ตาม branchId และ query ทั้งหมด รวม limit/offset โดยเรียงชื่อ field ก่อน hash
- การอ่านใน transaction, findById, ForUpdate, ตัวแก้ตัวเลือกของการขาย, auth, QR และรายงานกะอ่านฐานข้อมูลโดยตรง
- การเขียนหมุน generation ของกลุ่ม cache หลังฐานข้อมูล commit สำเร็จเท่านั้น Rollback ไม่ล้าง cache และ invalidation ใน transaction เดียวรวมกัน
- Generation เป็น UUID เพื่อให้ metadata ถูก eviction แล้วไม่กลับไปใช้ generation ของ cache เก่า การเติม cache ตรวจ generation แบบ atomic ด้วย Lua
- Cache miss ที่มาพร้อมกันใน process เดียวแชร์การอ่านฐานข้อมูลครั้งเดียว
- Redis ปิดหรือเชื่อมต่อไม่ได้ให้ fallback ไปฐานข้อมูล จำกัดเวลารอ 300 ms ต่อคำสั่ง และพักการลองใหม่ 10 วินาที เมื่อเชื่อมต่อกลับมาจะหมุน generation ก่อนอ่าน cache
- ความผิดพลาดของ Redis หลัง commit ไม่เปลี่ยนการขายที่สำเร็จเป็นข้อผิดพลาด ไม่มีการ replay คำสั่งขาย
- TTL เป็นขอบเขตความเก่าของรายการเมื่อ instance ใดขาดการเชื่อมต่อและ invalidation ส่งไม่ได้ การขายจริงยังอ่านข้อมูลใหม่ภายใน transaction

## การติดตั้ง

REDIS_URL ว่างคือปิด cache; รองรับ redis:// และ rediss:// คีย์มี CACHE_KEY_PREFIX สำหรับแยก installation ค่าเริ่มต้นผูกกับฐานข้อมูล ไม่พิมพ์ URL หรือรหัสผ่านลง log

Docker มี Redis 7.4 ภายใน network ของ compose ใช้ maxmemory 64mb และ allkeys-lru ไม่เก็บ cache ลง disk พอร์ตสำหรับพัฒนาผูกกับ 127.0.0.1 เท่านั้น

## การตรวจงานและข้อจำกัด

ตรวจ typecheck, lint, build, OpenAPI และ compose config โดยใช้ worktree กับ environment ของตัวเอง การตรวจ Docker ตาม AGENTS.md ใช้ COMPOSE_PROJECT_NAME แยกและพอร์ตแยกจากโครงการหลัก ไม่แตะฐานข้อมูล cloud

ไม่มีการเพิ่มหรือรันชุดทดสอบใหม่โดยไม่มีคำขอจากเจ้าของ ข้อจำกัดของการตรวจ runtime จะระบุในเอกสารส่งมอบ

Redis ลดการอ่านซ้ำของข้อมูลในขอบเขตนี้ การตรวจสิทธิ์และคำสั่งยังต้องมี PostgreSQL ที่ใช้งานได้ ปัญหา connection เต็มต้องจัดการ connection pool และโควตาฐานข้อมูลด้วย
