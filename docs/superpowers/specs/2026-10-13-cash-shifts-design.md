# กะร่วมกันและเงินสดในลิ้นชัก — EasyPOS

วันที่: 2026-10-13
สถานะ: ร่าง design สำหรับเจ้าของโครงการตรวจทาน ยังไม่ใช่ implementation
Branch: `ohmattpon/cash-shifts`

## 1. เป้าหมายและสิ่งที่ตกลงแล้ว

รองรับค้าปลีก คาเฟ่ และร้านอาหารด้วยกะที่ผูกกับจุดขาย/ลิ้นชักเงินจริงในสาขา พนักงานหลายคนใช้กะเดียวกันได้ แต่เข้าระบบด้วยบัญชีของตัวเอง ทุกบิลใหม่ต้องอยู่ในกะที่เปิดอยู่ ไม่ว่าจะรับเงินสด พร้อมเพย์ หรือบัตร ค้นหาสินค้าและสร้าง/แก้ออเดอร์ค้างได้ก่อนเปิดกะ

เจ้าของโครงการเลือกแนวทางที่เหมาะในระยะยาว: ใช้ API รุ่นใหม่สำหรับสัญญาการชำระที่ต้องระบุกะ ตามกฎการเปลี่ยนสัญญา API ใน AGENTS.md

ขอบเขตของร่างนี้คือจุดขาย เปิดกะ เงินเข้า–ออก ปิดกะ ประวัติกะ ผูกการขายกับกะ และบันทึกเงินสดคืนสำหรับบิลที่ยกเลิก ไม่รวมคืนสินค้าบางรายการ คืนเงินธนาคารอัตโนมัติ เครื่องพิมพ์ ระบบบัญชี เงินเดือน สิทธิ์แบบกำหนดเอง หรือขายแบบ offline

## 2. จุดขาย กะ และสิทธิ์

- จุดขาย (`register`) อยู่ในสาขาหนึ่งตลอดอายุ มีรหัสและชื่อ เช่น COUNTER1 / เคาน์เตอร์หน้าร้าน รหัสใช้ ASCII ตัวพิมพ์ใหญ่ ตัวเลข และขีดกลาง ยาว 1–20 ตัว ไม่ซ้ำภายในสาขา; ชื่อยาว 1–100 ตัว
- มีหลายจุดขายในสาขาได้ จุดขายหนึ่งเปิดกะได้ครั้งละหนึ่งกะ รวมสถานะกำลังปิดด้วย
- เจ้าของสร้าง เปลี่ยนชื่อ และปิดใช้งานจุดขายได้ ห้ามย้ายสาขา เปลี่ยนรหัส หรือลบ ห้ามปิดใช้งานขณะมีกะที่ยังไม่ปิด
- เตรียมจุดขาย MAIN / เคาน์เตอร์หลัก ให้แต่ละสาขาในการ migration และสร้างให้สาขาใหม่ผ่าน port จุดขายภายใน unit of work ของการสร้างสาขา
- พนักงานที่มีสิทธิ์ทำงานในสาขาขายผ่านจุดขายใดก็ได้ของสาขานั้น เปิดกะ บันทึกเงินเข้า–ออก และปิดกะร่วมได้ การเลือกจุดขายเป็นการเลือกเชิงปฏิบัติงาน ไม่ใช่หลักฐานสิทธิ์
- เจ้าของดูและจัดการกะของสาขาอื่นได้ผ่านสาขาที่เลือกและ `await branch()` เท่านั้น ข้อมูลจุดขาย/กะข้ามสาขาตอบว่าไม่พบ
- ทุก action เก็บ actor id, ชื่อ actor ณ ตอนทำรายการ และเวลา server ไม่มีบัญชีแคชเชียร์ร่วม ไม่มีการย้ายยอดไปตามผู้ที่ล็อกอินล่าสุด
- เจ้าของเท่านั้นยกเลิกบิลและบันทึกเงินสดคืนจากบิลยกเลิก ตามสิทธิ์ยกเลิกบิลที่มีอยู่

## 3. วงจรชีวิตกะ

`open → closing → closed`; ยกเลิกการนับได้ด้วย `closing → open`

### เปิดกะ

เลือกจุดขาย กรอกเงินตั้งต้นตั้งแต่ 0 พร้อมหมายเหตุที่ไม่บังคับ บันทึกยอดตั้งต้นจริง ไม่มีการนำยอดกะก่อนมาใช้โดยอัตโนมัติ ตรวจจุดขายและสิทธิ์ฝั่ง server ล็อกจุดขายก่อนเปิดกะ และมี unique constraint ป้องกันกะซ้อน

กะไม่ผูกกับวันที่ปฏิทิน ข้ามเที่ยงคืนได้และไม่ปิดเอง การออกจากระบบหรือปิด browser ไม่ปิดกะ

ตอนเปิดเก็บ currency และ timeZone ของร้านเป็น snapshot ของกะ ประวัติใช้ snapshot นี้แม้ร้านเปลี่ยนการตั้งค่าในภายหลัง ห้ามเปลี่ยน currency ขณะมีกะ open/closing ในสาขาใดของร้าน เพื่อไม่รวมเงินคนละสกุล การเปิดกะและคำสั่งเปลี่ยน currency ต้องล็อก settings row เดียวกันก่อนตรวจ/สร้างกะผ่าน ports ภายใน unit of work

### เริ่มนับเงิน

คำสั่งเริ่มปิดกะล็อกกะ เปลี่ยนเป็น `closing` และบันทึกภาพสรุป ณ จุดนั้น หยุดชำระและหยุดการเคลื่อนไหวเงินของจุดขายนั้น พร้อมแจ้งทุกเครื่องที่ใช้อยู่ จุดขายอื่นยังขายได้

หากมีการสร้าง QR ที่ยังไม่ทราบผลการสร้าง หรือทราบแล้วว่าจ่ายแต่ยังไม่ผูกบิล ต้องจัดการรายการนั้นก่อนเริ่มนับ ส่วน QR ที่สร้างแล้วและยังรอจ่ายแสดงคำเตือนพร้อมจำนวน/ยอด ผู้เริ่มนับต้องยืนยันว่าเข้าใจว่าการหยุดรอไม่ทำให้ QR ของธนาคารใช้ไม่ได้

เงินที่ควรมีและสรุปการขายแสดงให้ผู้นับเห็น รุ่นแรกใช้การนับแบบเห็นยอดเป้าหมาย ไม่อ้างว่าเป็น blind count

### ยืนยันปิดกะ

กรอกเงินสดที่นับจริงตั้งแต่ 0 ระบบคำนวณส่วนต่างเอง:

`ส่วนต่าง = เงินที่นับจริง − เงินสดที่ควรมี`

ถ้าส่วนต่างไม่เป็นศูนย์ ต้องกรอกเหตุผล 1–500 ตัว ระบบอนุญาตให้ปิดและเก็บความคลาดเคลื่อน ไม่มีการสร้างรายการเงินเข้า–ออกเพื่อทำให้ส่วนต่างกลายเป็นศูนย์ ไม่มีการนำเงินจริงออกจากลิ้นชักอัตโนมัติ

ผู้เริ่มนับหรือเจ้าของเป็นผู้ยืนยัน/ยกเลิกการนับได้ พนักงานคนอื่นเห็นว่ากำลังนับและเห็นชื่อผู้ดำเนินการ เจ้าของรับช่วงได้โดยเก็บ actor ของทุกขั้นตอน หลัง server restart กะที่กำลังนับยังเป็น `closing` ไม่หมดอายุหรือเปิดกลับเอง

กะปิดแล้วเปิดกลับ แก้ยอด หรือลบไม่ได้ การแก้ความผิดพลาดทำเป็นรายการในกะใหม่พร้อมอ้างอิงและเหตุผล

Start closing เพิ่ม revision และคืน closingRevision ให้ client; Close/Cancel ต้องส่ง revision นี้เพื่อปฏิเสธหน้าจอนับเก่าที่ถูกยกเลิกแล้วเริ่มนับใหม่ ส่วนต่างเป็นจำนวนเต็มสตางค์แบบมีเครื่องหมาย อยู่ในช่วง −MAX_AMOUNT_SATANG ถึง MAX_AMOUNT_SATANG

## 4. เงินสดและรายงานกะ

ยอดเงินสดคำนวณจาก ledger ที่เพิ่มรายการได้อย่างเดียว:

`เงินตั้งต้น + เงินสดจากการขาย − เงินทอน + เงินนำเข้า − เงินนำออก − เงินสดคืนที่บันทึกแล้ว`

- รับเงินสด 1,000 เพื่อซื้อสินค้า 750 ทอน 250: เงินสดสุทธิเข้าลิ้นชัก 750
- จ่ายผสมเงินสด 600 + พร้อมเพย์ 500 สำหรับบิล 1,000 และทอน 100: เงินสดสุทธิ 500 พร้อมเพย์ 500
- เงินสดรับและเงินทอนแสดงแยกในรายงาน แต่ ledger ลงยอดสุทธิรายการเดียว ป้องกันลบเงินทอนสองครั้ง
- การเติมเงินทอนเป็น `cash_in`; การนำเงินไปฝาก/ซื้อของเป็น `cash_out` ต้องมีจำนวนบวกและเหตุผล 1–500 ตัว
- ห้ามบันทึกเงินออกมากกว่าเงินที่ควรเหลือ ณ ตอนทำรายการ ไม่มีสต็อกหรือบิลขายเกิดจาก cash in/out
- จำนวนเงินเป็นจำนวนเต็มสตางค์ รายการหนึ่งไม่เกิน `MAX_AMOUNT_SATANG` ใช้ bigint ในการรวมฐานข้อมูลและตรวจขอบเขตก่อนแปลงเป็น number; ยอดเงินสดและยอดขายรวมที่เก็บต่อกะต้องไม่เกินเพดานเดียวกัน ถ้าคำสั่งจะเกินให้ปฏิเสธก่อนเปลี่ยนสถานะ และแจ้งให้ปิดกะ/เปิดกะใหม่
- เงินตั้งต้นไม่ถือเป็นยอดขาย เงินนำเข้า–ออกไม่ถือเป็นรายได้หรือค่าใช้จ่ายทางบัญชี รายงานต้องใช้ชื่อที่บอกว่าเป็นเงินในลิ้นชัก
- สรุปกะประกอบด้วยจำนวนบิล ยอดขายที่บันทึก ยอดแยกวิธีรับชำระ เงินสดรับ เงินทอน การนำเข้า–ออก เงินสดคืน และยอดยกเลิกที่ทราบ ณ เวลาสรุป
- ยอดพร้อมเพย์/บัตรในกะหมายถึงยอดที่ผูกกับบิลแล้ว ไม่อ้างว่าเท่ากับยอด settlement ของธนาคาร
- ยอดขายที่บันทึก (gross) รวมบิลที่เกิดในกะทั้งหมด ยอดยกเลิกแสดงแยก และยอดขายหลังยกเลิก ณ cutoff = gross − ยอดบิลของกะที่ voided ณ cutoff; บิลกะเก่าที่มา void ในกะนี้แสดงเป็นเหตุการณ์แยก ไม่หัก gross ของกะนี้ เงินสดรับไม่ถูกลบเพราะ void จนกว่าจะมี cash refund entry
- ตอนเริ่มนับบันทึก snapshot ของยอดและสถานะบิล ณ cutoff; ตอนปิดเพิ่มจำนวนที่นับจริง ส่วนต่าง เหตุผล และผู้ปิด การยกเลิกบิลหลังจากนั้นไม่แก้ snapshot กะเก่า
- หน้ารายละเอียดแสดงเหตุการณ์ที่เกิดหลังปิดแยกจาก snapshot เช่น บิลในกะนี้ถูกยกเลิกในวันถัดไป

## 5. การยกเลิกบิลและเงินสดคืน

การยกเลิกบิลเป็น action ด้านบิลและสต็อก การคืนเงินจริงเป็นอีก action หนึ่ง ห้ามหักยอดลิ้นชักเพียงเพราะสถานะบิลกลายเป็น voided

หลังยกเลิกบิลที่มีเงินสด เจ้าของเห็นรายการรอบันทึกเงินสดคืน พร้อมเลือกกะเปิดของจุดขายที่จะนำเงินออก ต้องอยู่สาขาของบิล เงินคืนคือเงินสดสุทธิของบิลเดิม (`cash tendered − change`) เต็มจำนวนเพียงครั้งเดียวในรุ่นนี้ หากคืนหลังปิดกะเดิม ลงเงินออกในกะปัจจุบันและอ้างอิงบิล/กะเดิม

คำสั่งคืนเงินสดตรวจว่าบิลยกเลิกแล้ว มีเงินสดสุทธิ และยังไม่เคยบันทึกคืน ล็อกกะและบิล พร้อม unique constraint ตาม sale id ป้องกันกดซ้ำ หากเงินในลิ้นชักไม่พอ ต้องเติมเงินจริงแล้วบันทึก cash in ก่อน บิลเก่าที่ไม่มี shift id คืนเงินจากกะใหม่ได้ภายใต้กติกาเดียวกัน

คำสั่งนี้บันทึกว่าพนักงานคืนเงินสดแล้ว ไม่มี hardware ยืนยันว่าเงินถูกส่งให้ลูกค้า ผู้ใช้ต้องทำเงินจริงตามรายการที่บันทึก หน้า UI ต้องแยกปุ่มยกเลิกบิลและยืนยันคืนเงินให้ชัด

บิลพร้อมเพย์/บัตรยกเลิกได้แต่ไม่สั่งธนาคารคืนเงินใน feature นี้ และไม่แสดงว่าเงินธนาคารคืนแล้ว เงินสดส่วนของบิลชำระผสมใช้กติกาข้างบน ไม่มีการคืนบางรายการสินค้าในรุ่นนี้

## 6. บิล ออเดอร์ และ QR

- v2 checkout รับ `shiftId` ที่ client เลือกอย่างชัดเจน Server ตรวจสาขา จุดขาย และสถานะ `open` ทุกครั้ง ไม่มีการค้นหากะใหม่มาทดแทน shift id เก่าโดยเงียบ ๆ
- `SaleCheckout` ยังคงเป็นทางเดียวที่สร้างบิล ทั้งขายทันทีและชำระออเดอร์ การผูกบิลและลง cash ledger อยู่ใน transaction เดียวกับ stock, receipt number และ QR claim
- บิลผูกกะตอนชำระ ไม่ใช่ตอนเปิดออเดอร์ ออเดอร์ค้างส่งต่อข้ามกะได้โดยรักษาราคาที่ตกลงไว้
- QR v2 ต้องผ่านกะเปิดก่อนเริ่มขอ QR เก็บ `originShiftId` เป็นร่องรอยการเริ่มชำระ ไม่ใช่กะของบิลที่อาจบันทึกภายหลัง
- การขอ QR ใช้ durable attempt: จอง reference และกะก่อนเรียก SCB แล้วเรียกธนาคารนอก transaction ที่ล็อกกะ เก็บผลสำเร็จ/ล้มเหลว/ไม่ทราบผลในรายการ attempt กะที่ยังมี attempt กำลังทำหรือไม่ทราบผลเริ่มนับไม่ได้; recovery ต้องตรวจผลหรือบันทึกความล้มเหลวที่ยืนยันได้ ห้ามปลดจองจาก timeout อย่างเดียว
- QR ที่รอจ่ายอยู่หยุดแสดงได้เมื่อเริ่มนับ แต่ห้ามอ้างว่า QR ที่ลูกค้าบันทึกไว้ถูกเพิกถอนจากธนาคาร
- ถ้าธนาคารยืนยันจ่ายระหว่างนับก่อนปิด และยังไม่ผูกบิล คำสั่งปิดต้องปฏิเสธให้ยกเลิกการนับแล้วจัดการบิล ก่อนนับใหม่
- เงินอาจมาช้าหลังปิดแล้วได้ จึงมีรายการ QR จ่ายแล้วแต่ยังไม่มีบิลให้เข้าถึงได้ในสาขา รายการนี้อยู่ต่อแม้ logout หรือปิด browser
- บันทึก QR ที่จ่ายช้าลงบิลในกะเปิดปัจจุบัน โดยผู้ใช้ยืนยันว่ากำลังใช้เงินจาก QR กะก่อน เก็บ origin shift และ sale shift แยกกัน กะเก่าไม่เปลี่ยนและไม่มีการให้ลูกค้าจ่ายซ้ำ
- ถ้าขายไม่ได้เพราะสินค้า/สต็อก/ยอดเงินผิด ห้ามเปลี่ยน QR paid กลับเป็น pending หรือถือว่าเงินคืนแล้ว คงรายการจ่ายแล้วที่ยังไม่มีบิลให้เจ้าของจัดการ
- Callback ยังคงเป็นเพียงสัญญาณให้ inquiry SCB ตาม AGENTS.md; ผลจ่ายแล้วมาจาก SCB เท่านั้น การอ่านสถานะ v2 เป็น query ล้วน การ refresh เป็นคำสั่ง `POST` แยก ไม่แอบเปลี่ยนข้อมูลใน GET

## 7. ข้อมูลและความพร้อมกัน

ตารางใหม่:

| ตาราง | ข้อมูลหลักและข้อบังคับ |
|---|---|
| `registers` | branchId, code, name, isActive; unique(branchId, code), ไม่ลบ |
| `shifts` | branchId, registerId, status, currency/timeZone snapshot, openingCashSatang, opening/closing actors และเวลา, closing snapshot, countedCashSatang, differenceSatang, differenceReason, revision |
| `shift_cash_entries` | shiftId, branchId, kind, amountSatang, saleId ถ้ามี, note, actor snapshot, createdAt; เพิ่มอย่างเดียว |
| `shift_qr_attempts` | originShiftId, reference, state creating/ready/failed/unknown, qrPaymentId, actor, idempotency key; เก็บก่อนเรียกธนาคาร |
| `command_receipts` | actor/branch/action/key, payload hash, ผลลัพธ์ที่คืนได้; unique ตาม scope; ไม่มีคีย์ธนาคารหรือความลับ |

เพิ่ม `sales.shiftId` แบบ nullable เพื่อรักษาบิลเก่า และ `qr_payments.originShiftId` แบบ nullable เพื่อรักษา QR เก่า ข้อมูลใหม่จาก v2 ต้องมี shift id ส่วนบิลเก่าแสดงว่า “ก่อนเริ่มใช้ระบบกะ” ไม่ backfill เข้ากะสมมติ

มี partial unique index ที่ registerId สำหรับ shift status open/closing มี unique cash-sale entry และ unique cash-refund entry ต่อ sale ป้องกันลงซ้ำ

Lock order สำหรับคำสั่งที่เกี่ยวข้อง: settings (เฉพาะเปิดกะ/เปลี่ยน currency) → register (เฉพาะเปิดกะ/แก้จุดขาย) → shift → order หรือ sale → product ตาม id → QR/receipt rows ตามลำดับเดิม ให้ทุกคำสั่งขาย ยกเลิก และเงินคืนใช้ลำดับเดียวกัน อ่าน stock ใน statement หลังล็อก products ตามกฎเดิม PayOrder v2 ต้องล็อก shift ก่อนล็อก order ต่างจากลำดับของ v1 ปัจจุบัน; SaleCheckout รับการล็อกกะเดียวกันใน transaction เดิมได้

Void v2 อ่าน linkage ของบิลก่อนแล้วล็อกกะต้นทางก่อนล็อกบิลและตรวจ linkage ซ้ำ บิลจากกะ closing ยกเลิกไม่ได้จนกว่าจะยกเลิกการนับหรือปิดกะเสร็จ; บิลจากกะ closed ยกเลิกได้โดยไม่แก้ snapshot ส่วนการคืนเงินใช้คำสั่งแยกล็อกกะที่จะนำเงินออกก่อนบิล

เริ่มปิดและชำระพร้อมกันต้องมีผู้ชนะคนเดียว: ถ้าบิล commit ก่อนให้รวมใน snapshot; ถ้า shift เปลี่ยนเป็น closing ก่อนให้ปฏิเสธ checkout โดยไม่ตัดสต็อกหรือใช้ QR การเริ่มนับกะอื่นไม่ล็อกทั้งสาขา

คำสั่งเปิดกะ เงินเข้า–ออก คืนเงินสด ปิดกะ และ v2 checkout ใช้ `Idempotency-Key` UUID จาก client คงเดิมในการ retry รายการเดียว หาก key เดิมและ body เดิมคืนผลเดิมแม้กะปิดแล้ว; body ต่างตอบ conflict ป้องกันยอด/บิลซ้ำเมื่อคำตอบหาย ไม่ลบ receipt ของคำสั่งเงินในรุ่นแรก

การ replay ยังต้องตรวจ session/actor และสิทธิ์สาขาปัจจุบันก่อนอ่านผลเดิม เก็บผลของคำสั่งสำเร็จใน transaction เดียวกับ action; ไม่เก็บ validation/business failure เพื่อให้แก้เงื่อนไขแล้ว retry ได้ Start/Cancel closing และ void ใช้ receipt เช่นเดียวกันเพื่อคืนผลเดิมเมื่อคำตอบหาย

QR attempt ใช้ key เดียวผูก reference เดียว การ retry เมื่อผลธนาคารไม่ชัดต้องคืนสถานะไม่ทราบผลเพื่อ recovery ไม่เรียก create QR ซ้ำทันที Idempotency ของเราไม่อ้างว่า SCB รองรับ key เดียวกัน

## 8. Hexagonal และ CQRS

โมดูลใหม่ `modules/shifts` และ entities ใน `domains/` ทำตามต้นแบบ categories Repository ใช้ currentExecutor() เท่านั้น ข้อมูลเงินสดในกะเป็นหน้าที่ของ shifts; sales และ QR เรียกผ่าน ports ไม่แตะตาราง shifts โดยตรง

Ports: `IRegisterRepository`, `IShiftRepository`, `IShiftCashRepository`, `IShiftLedger`, `IShiftQrAttempts`, `IShiftSettingsGuard`, `IQrShiftReadiness`, `ICommandReceipts`, `ICheckoutPolicy`; clock และ unit of work ใช้ ports เดิม Settings เปิดเผย getForUpdate และเรียก IShiftSettingsGuard เมื่อต้องเปลี่ยน currency

`IShiftLedger` เปิดเผยการล็อก/ตรวจ shift และบันทึก cash entry ภายใน unit of work ของผู้เรียก `IQrShiftReadiness` เป็น query port ของ qr-payments สำหรับอ่าน attempt/paid-unclaimed โดยไม่ inquiry SCB ระหว่างล็อกกะ

Commands: CreateRegister, UpdateRegister, OpenShift, RecordCashIn, RecordCashOut, StartShiftClosing, CancelShiftClosing, CloseShift, RecordVoidedSaleCashRefund และ v2 checkout/QR refresh

Queries: ListRegisters, ListShifts, GetShift, GetCurrentShift, ListShiftCashEntries, ListUnclaimedPaidQrPayments

Use cases เป็น injectable class, execute(input: unknown, actor/branch แยก), zod parse ขั้นแรก Commands ที่เขียนหลายตารางใช้ IUnitOfWork.run(); query ไม่เรียก command

Errors เป็น domain error ภาษาไทย รหัสคงที่ เช่น REGISTER_NOT_FOUND, REGISTER_IN_USE, SHIFT_NOT_FOUND, SHIFT_ALREADY_OPEN, SHIFT_NOT_OPEN, SHIFT_CLOSING, SHIFT_ALREADY_CLOSED, SHIFT_CLOSING_OWNER_REQUIRED, SHIFT_DIFFERENCE_REASON_REQUIRED, CASH_BALANCE_INSUFFICIENT, CASH_REFUND_ALREADY_RECORDED, QR_PAYMENT_UNRESOLVED, IDEMPOTENCY_KEY_REUSED ใช้ชนิด error และ RFC 9457 factory เดิม เพิ่มคำแปลเว็บตาม code

## 9. API v2 และการย้ายรุ่น

การเพิ่ม shiftId ที่บังคับใช้เป็น breaking change จึงไม่เปลี่ยน request เดิมของ v1 แนวทาง versioning อ้างอิง [Microsoft Web API Design](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design#versioning-a-restful-web-api)

v2 ใช้ domain/use cases/ports ร่วมกับ v1 แต่มี controllers และ HTTP schemas แยก ไม่คัดลอกกฎเงินหรือ stock เป็นสองชุด auth/session และ API ที่ไม่เกี่ยวกับกะยังใช้ v1 ได้ การยกเลิก v1 ใช้กับเส้นทางเงินที่ประกาศไว้เท่านั้น ไม่เลิก v1 ทุกเส้นทาง

| เส้นทาง v2 | การทำงาน |
|---|---|
| `GET, POST /registers`; `PATCH /registers/{id}` | รายการ/สร้าง/แก้จุดขาย |
| `GET /registers/{id}/current-shift` | กะปัจจุบันหรือ null |
| `GET, POST /shifts`; `GET /shifts/{id}` | ประวัติ/เปิด/รายละเอียดกะ |
| `GET, POST /shifts/{id}/cash-entries` | อ่าน/บันทึกเงินเข้า–ออก kind cash_in/cash_out เท่านั้น |
| `POST /shifts/{id}/start-closing` | พักขายและเริ่มนับ |
| `POST /shifts/{id}/cancel-closing` | ยกเลิกการนับ |
| `POST /shifts/{id}/close` | ยืนยันจำนวนที่นับและเหตุผลส่วนต่าง |
| `POST /sales`; `POST /orders/{id}/pay` | checkout เดิมพร้อม shiftId ที่บังคับ |
| `POST /sales/{id}/void` | ยกเลิกบิลผ่านกฎเดิมและบันทึก actor; ไม่หักเงินสดเอง |
| `POST /sales/{id}/cash-refund` | คืนเงินสดบิลยกเลิกจาก shiftId ที่เปิด |
| `POST /payments/qr` | ขอ QR โดยระบุ shiftId และเก็บ attempt |
| `GET /payments/qr/{id}` | อ่านสถานะล้วน |
| `POST /payments/qr/{id}/refresh` | ถามธนาคารและบันทึกผล |
| `POST /payments/qr/{id}/cancel` | หยุดรอ โดยตรวจผลผ่าน command ตามกฎเดิม |
| `GET /payments/qr/unclaimed` | รายการ paid ที่ยังไม่มีบิลในสาขา |

ทุก path ในตารางอยู่ใต้ `/api/v2` Lists คืน page `{items,total}`; รายการกะ cash entries และ unclaimed QR รับ limit/offset รวมตัวกรอง branch/status/ช่วงเวลา วาง static path unclaimed ก่อน dynamic id

### ช่วงเปลี่ยนผ่านและการบังคับกะ

การมี v2 อย่างเดียวไม่ป้องกัน v1 ที่ขายโดยไม่มีกะ จึงกำหนดโหมด deployment สองแบบด้วย `CHECKOUT_MODE=legacy|shifts` ที่ root .env และ .env.example ค่าเริ่มต้น legacy เพื่อไม่เปลี่ยนพฤติกรรมการติดตั้งเดิม

- **legacy:** v1 money endpoints คงสัญญา/พฤติกรรมเดิม เตรียมจุดขายและอ่านประวัติได้ แต่เปิดกะและ v2 checkout/QR create ไม่ได้ ตอบ CHECKOUT_MODE_REQUIRED (409) ป้องกันยอดกะปะปนกับบิลไร้กะใน deployment เดียว
- **shifts:** หลังย้ายผู้เรียกทั้งหมดและเจ้าของประกาศ retirement ของ v1 money commands แล้ว เปิด v2 money commands และกะ; v1 `POST /sales`, `POST /orders/{id}/pay`, `POST /sales/{id}/void`, `POST /payments/qr`, `POST /payments/qr/{id}/cancel` ถูกเลิกให้บริการตามประกาศ lifecycle และตอบ Problem Details 404 / API_VERSION_RETIRED ไม่ดัดแปลงให้รับ body ใหม่ Callback SCB เดิมและ v1 reads ยังคงทำงาน
- ก่อน cutover ต้องยืนยันผู้เรียกทั้งหมดใช้ v2 สำรองข้อมูล ตรวจ pending/paid-unclaimed QR เดิม ให้มีขั้นตอนรับรายการเก่าใน v2 และประกาศกับผู้ใช้ API การ retirement เป็นการเปลี่ยนความพร้อมให้บริการที่มีผลต่อ client เก่าอย่างตั้งใจ ไม่อ้างว่าเป็น backward-compatible
- การเปิด shifts เป็นการเปลี่ยนโดยเจ้าของ deployment ไม่เปิดเองจาก migration/seed และไม่ทำในงาน design นี้ ทั้งร้านเปลี่ยนโหมดพร้อมกัน รุ่นแรกไม่ทำโหมดแยกรายสาขา
- กลับ legacy ได้เฉพาะก่อนมีกะหรือบิล v2; ถ้ามีข้อมูลกะแล้ว server ปฏิเสธการเปิด legacy เพื่อไม่สร้างช่องทาง bypass หลัง cutover เก็บเครื่องหมายการ activate ในฐานข้อมูลผ่าน migration/bootstrap policy port และตรวจตอน startup
- ยังไม่กำหนดวันที่ sunset v1 ใน design นี้: เป็นขั้นตอนปล่อย deployment ที่เจ้าของเลือกหลัง migration checklist ผ่าน ไม่มีการ retire โดยการเขียน spec

เปลี่ยน frontend money hooks ไป client v2, config capability query แสดง checkoutMode ให้ frontend ไม่ต้องเดาจาก error ยังใช้ v1 reads ได้และเก็บ v1/v2 OpenAPI แยกกัน ต้องแจ้งเจ้าของก่อนสร้าง baseline ใหม่ตาม AGENTS.md

## 10. หน้าเว็บ

Feature ใหม่ `features/shifts`: api.ts, locales.ts ไทย/อังกฤษ, components, hooks และ lib/store เท่าที่จำเป็น ส่งออกผ่าน index.ts เท่านั้น

- หน้าขายมีตัวเลือกจุดขาย ชื่อกะ และสถานะ; ถ้าไม่เปิดกะแสดงปุ่มเปิดกะ ปุ่มชำระไม่ทำงานแต่ยังทำตะกร้า/ออเดอร์ค้างได้
- Dialog เปิดกะ: จุดขาย เงินตั้งต้น หมายเหตุ และปุ่มยืนยัน
- หน้ากะ: สรุปกะปัจจุบัน เงินเข้า–ออก ประวัติและผู้ทำรายการ พร้อมปุ่มเริ่มนับ
- หน้านับ: สรุปที่หยุดยอดแล้ว ช่องเงินที่นับจริง ส่วนต่าง เหตุผล และปุ่มยืนยัน/ยกเลิก แสดงชื่อผู้เริ่มนับให้เครื่องอื่นเห็น
- ประวัติกะ: ตัวกรองจุดขาย วันที่ สถานะ; เปิดดู snapshot ปิดกะและรายการที่อ้างอิงภายหลัง แบ่งหน้า
- รายการเงินสดคืนและ QR paid-unclaimed ต้องเข้าถึงได้จากหน้ากะ ไม่ผูกกับ dialog ชำระที่หายเมื่อ reload
- เจ้าของจัดการจุดขายในหน้ากะผ่านแผงแยก
- ทุกเครื่อง query สถานะกะที่ใช้ทุก 5 วินาทีและ refetch เมื่อ focus; server ตรวจซ้ำทุก command จึงไม่พึ่ง polling เพื่อความถูกต้อง
- Zustand เก็บเฉพาะ registerId ที่เลือก โดย scope user+branch; ไม่เก็บ server shift/status/totals ล้าง selection และ state เกี่ยวข้องเมื่อ logout/สลับสาขา เปลี่ยนจุดขายขณะมี QR แสดงอยู่ต้องยืนยันหยุดรอและเก็บร่องรอย recovery
- ยึด DESIGN.md เรื่อง layout/components/สี/ตัวเลข; ใช้ t(), useFormat(), TanStack Query key factories ตาม AGENTS.md ซึ่งเป็น authority สำหรับ formatting ที่ทันสมัยกว่า DESIGN.md บางส่วน
- ประวัติกะจัดรูปแบบด้วย useFormat ที่รับ currency/timeZone snapshot เป็น override ผ่าน helper ส่วนกลาง ไม่ใช้ค่าร้านปัจจุบันแปลงเงินกะเก่า และไม่ใช้ Intl ตรงใน components

## 11. การย้ายข้อมูลและหลักฐานที่ต้องทดสอบตอน implementation

Migration เพิ่ม tables/FKs/nullable linkage โดยไม่แก้ยอด สถานะ หรือเวลาในบิลเดิม เตรียม MAIN registers แต่ไม่เปิดกะเอง ไม่สร้างยอดเงินตั้งต้นจากการเดา อธิบาย migration/retirement และ backup ในเอกสาร deployment

Unit: state transitions, เงินผสมและเงินทอน, limit/overflow, เงินออกเกินยอด, กะปิดแก้ไม่ได้, สิทธิ์/สาขา, idempotency, เงินคืนหนึ่งครั้ง, QR readiness และ snapshot คงเดิม

Integration กับ PostgreSQL จริง: เปิดกะพร้อมกัน, ชำระชนเริ่มนับ, ปิดสองครั้ง, พนักงานหลายคนใช้กะเดียว, rollback stock/receipt/ledger/QR ทั้งชุด, คืนเงินข้ามกะในสาขาเดิม, กะข้ามวัน, snapshot ไม่เปลี่ยนหลัง void, เปลี่ยน currency ชนเปิดกะ, v1 compatibility ใน legacy และ retirement ใน shifts, reload/retry แล้วไม่มีบิลซ้ำ

SCB integration ใช้ fake SCB เท่านั้น: paid ก่อน/ระหว่าง/หลัง closing, paid-unclaimed ที่ต้อง recovery, unknown create outcome, callback ปลอม, กะปิดแล้ว retry บันทึกในกะใหม่โดยไม่ใช้ QR ซ้ำ ห้ามชุดทดสอบเรียก SCB จริง

Browser: สอง session บัญชีต่างกันขายในกะเดียว, อีกเครื่องเริ่มนับแล้วเครื่องแรกขายไม่ได้, เปิดใหม่หลัง refresh, variance reason, cash refund action และ QR recovery, ไทย/อังกฤษ พฤติกรรมและเงินที่เห็นตรงกับ API

ก่อนรายงาน implementation เสร็จ ต้องผ่าน bun run typecheck, bun run test, web lint และ OpenAPI checks ของ v1/v2 ตามสัญญาที่อนุมัติ หลักฐานทดสอบ bank จริงยังเป็นอีกขั้นตอน ไม่สรุปจาก fake SCB ว่าเคยรับเงินจริงสำเร็จ

## 12. ลำดับลงมือทำหลังอนุมัติ spec

1. API routing/versioning และ checkout policy พร้อม legacy contract tests
2. Registers, shift entities, cash ledger, lifecycle, migration และ concurrency tests
3. v2 SaleCheckout/order payment linkage และ idempotency
4. Void/cash refund และ QR attempt/recovery/refresh integration
5. Feature shifts UI, v2 hooks, session/branch isolation และ multi-session browser checks
6. ตรวจครบและเขียนคู่มือ cutover; เจ้าของเป็นผู้ push/เปิด PR/merge/เปิด shifts mode

เอกสารนี้เป็นข้อเสนอที่ครบพอให้ review แต่ยังไม่อนุมัติ implementation สิ่งที่ตกลงแล้วระบุในหัวข้อ 1 รายละเอียด cash refund, closing และ rollout เป็นข้อเสนอให้ตรวจทานพร้อม spec
