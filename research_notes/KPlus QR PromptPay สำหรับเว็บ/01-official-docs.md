# KPlus QR / PromptPay สำหรับเว็บ — 01 Official Docs

## Official name / portals (ชื่อทางการ + URL)

### Takeaway
พอร์ทัลทางการชื่อ K-APi (KBANK OPEN API) ที่ apiportal.kasikornbank.com; หน้าธุรกิจบน kasikornbank.com ใช้อธิบายผลิตภัณฑ์และรับสมัคร ส่วน KGP (Kasikorn Global Payment) คือบริษัทลูกสำหรับ online payment.

### Cited Findings
- KBank OPEN API / K APi portal อยู่ที่ https://apiportal.kasikornbank.com/ — [K APi portal](https://apiportal.kasikornbank.com/)
- KBank เองสื่อสารชื่อ "KBank OPEN API (https://apiportal.kasikornbank.com)" — [KATALYST by KBank (Facebook)](https://www.facebook.com/KATALYSTbyKBank/posts/%E0%B8%A7%E0%B8%B1%E0%B8%99%E0%B8%99%E0%B8%B5%E0%B9%89%E0%B9%80%E0%B8%A3%E0%B8%B2%E0%B8%88%E0%B8%B0%E0%B8%A1%E0%B8%B2%E0%B8%97%E0%B8%B3%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B8%A3%E0%B8%B9%E0%B9%89%E0%B8%88%E0%B8%B1%E0%B8%81%E0%B8%81%E0%B8%B1%E0%B8%9A-api-%E0%B8%AB%E0%B8%A3%E0%B8%B7%E0%B8%AD-application-programming-interface-%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B9%82%E0%B8%94%E0%B8%A2%E0%B8%96%E0%B9%89/914952818858600/)
- หน้า K PAYMENT GATEWAY บน portal: https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference — [K Payment Gateway API Reference](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference)
- หน้า QR Payment product landing: https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Introduction และ Try API ที่ https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Try%20API — [QR Payment landing](https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Introduction)
- หน้า KGP Merchant Payment Platform: https://apiportal.kasikornbank.com/product/public/All/KGP%20Merchant%20Payment%20Platform/Try%20API และ /Documentation — [KGP Merchant Payment Platform](https://apiportal.kasikornbank.com/product/public/All/KGP%20Merchant%20Payment%20Platform/Try%20API)
- หน้าธุรกิจ "บริการคิวอาร์เชื่อมต่อผ่านระบบ (QR API)": https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx — [KBank QR API (TH)](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx)
- หน้า K-Payment Gateway ฝั่งธุรกิจ: https://www.kasikornbank.com/en/business/sme/topproduct/pages/k-payment-gateway.aspx — [K-Payment Gateway business page](https://www.kasikornbank.com/en/business/sme/topproduct/pages/k-payment-gateway.aspx)
- KGP เว็บไซต์บริษัท: https://www.kasikornglobalpayment.com/en — [KGP](https://www.kasikornglobalpayment.com/en)
- developer.kasikornbank.com ไม่ใช่ host หลักในผลค้นหา; host ทางการที่พบคือ apiportal.kasikornbank.com — [K APi portal](https://apiportal.kasikornbank.com/)

### Inferences
- อย่าสับสน developer.kasikornbank.com (ไม่พบเป็นทางการ) กับ apiportal.kasikornbank.com (ทางการ)
- "K PLUS" คือแอป consumer banking ไม่ใช่ชื่อ API; ชื่อ API ฝั่งร้านค้าคือ QR Payment / QR API / K Payment Gateway / KGP Merchant Payment Platform

### Gaps
- ไม่สามารถยืนยันได้ว่า developer.kasikornbank.com เคยมีอยู่แล้ว redirect หรือไม่ เพราะ webfetch/fetch เนื้อหา portal เป็น JS-heavy (fetch ได้เพียง "K APi")

## Merchant onboarding (สมัคร, MID, keys)

### Takeaway
QR API ไม่มี self-service signup แบบสมัครแล้วได้ key ทันที; ต้องกรอกฟอร์มสนใจบนเว็บ KBank แล้วเจ้าหน้าที่ติดต่อกลับภายใน ~5 วันทำการ พร้อมฟอร์มและเอกสาร; กรณีผ่าน platform (เช่น BentoWeb) ต้องระบุ Partner Shop ID และหลังอนุมัติจะได้ Merchant ID มากรอกในระบบ

### Cited Findings
- หน้าธุรกิจ QR API ระบุ "วิธีการสมัคร และคุณสมบัติ" เริ่มที่ "เข้าไปที่ Website Kbank K API" เป็นขั้นตอนที่ 1/9 (เนื้อหาเต็มอยู่หลัง JS/รูป ไม่ดึงได้ทั้งหมด) — [KBank QR API (TH)](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx)
- คู่มือฝั่ง BentoWeb: รูปแบบธุรกิจที่สมัครได้คือ (1) บุคคลธรรมดา (2) นิติบุคคล; ลงทะเบียนผ่าน "ลิ้งค์สนใจสมัครใช้บริการ QR Payment" แล้ว "เจ้าหน้าที่ธนาคารจะติดต่อกลับ เพื่อส่งฟอร์มการสมัครและเอกสารที่ใช้ในการสมัครต่างๆ ภายใน 5 วันทำการ" — [BentoWeb help](https://help.bentoweb.com/th/article/qr-payment-ape0g5/)
- คู่มือเดียวกัน: "จำเป็นต้องตรวจเช็ค Partner Shop ID จากระบบหลังร้าน" และระบุในใบสมัคร; หลังอนุมัติ "นำ Merchant ID ที่ได้รับ มากรอกลงในระบบ" — [BentoWeb help](https://help.bentoweb.com/th/article/qr-payment-ape0g5/)
- ติดตามผลสมัคร: "ติดต่อ KBIZ Call Center โทร. 02-888-8822 หลังจากนั้น กด 1... กด 3... กด 0... แจ้งว่า 'ต้องการติดตามสถานะการสมัคร QR API' โดยแจ้ง Email หรือเลขบัญชีที่ใช้สมัคร" — [BentoWeb help](https://help.bentoweb.com/th/article/qr-payment-ape0g5/)
- QR API สร้าง "Thai QR Code แบบ Dynamic QR (ระบุยอดเงิน ลูกค้าแก้ไขไม่ได้)" และ request สร้างได้จากระบบร้านค้าเอง — [KBank QR API (TH)](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx)
- K PLUS เป็น consumer app (~23.1 ล้านผู้ใช้ปลาย 2024); ร้านค้ารับเงินผ่าน Thai QR/PromptPay ที่ออกโดยธนาคาร/PSP ไม่ใช่เปิดบัญชี K PLUS เอง — [Antom merchant guide](https://knowledge.antom.com/merchants-guide-to-k-plus-in-thailand-kbank)

### Inferences
- Credential model มีอย่างน้อย Merchant ID (+ Partner Shop ID กรณีผ่าน aggregator/platform); API secret/key, OAuth client, certificate ยังไม่เห็นจากแหล่งทางการที่ดึงได้ — ต้องอ่าน docs หลัง login portal
- เอกสารทางการ (KBTG Life ep.2) พูดถึง OAuth 2.0 client-credentials สำหรับ partner app ที่ได้รับการรับรอง แสดงว่า API บางกลุ่มใช้ OAuth ไม่ใช่แค่ static key — [KBTG Life](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)

### Gaps
- ไม่มีแหล่งทางการที่ดึงได้ระบุรายการเอกสารสมัคร (บัตรประชาชน/ทะเบียนการค้า/บัญชีรับเงิน), ระยะเวลาอนุมัติจริง, และขั้นตอนขอ sandbox key vs production key — ต้อง login portal หรือถามเจ้าหน้าที่
- ไม่พบขั้นตอนขอ MID/API keys/certificates แบบละเอียด (self-service หรือไม่) จาก official docs ที่เข้าถึงแบบไม่ login

## API reference / sandbox / SDK (เอกสาร, ทดสอบ, Postman, SDK)

### Takeaway
เอกสาร API อยู่บน K-APi portal แยกเป็นผลิตภัณฑ์ (K Payment Gateway, QR Payment, KGP Merchant Payment Platform) แต่ละหน้ามี Getting Started / Integration Methods / API Reference / Try API; มี sandbox + production base URL แยกกัน; SDK ทางการไม่พบ มีแต่ community SDK

### Cited Findings
- K Payment Gateway มีหัวข้อ Getting Started, Integration Methods, API Reference (Cancel QR, Void QR, Create Payment Link, Inquiry...) — [K Payment Gateway API Reference](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference)
- QR endpoints บน K Payment Gateway ใช้ base URL: Production https://kpaymentgateway-services.kasikornbank.com ; Sandbox https://dev-kpaymentgateway-services.kasikornbank.com — [Create Order API (portal snippet)](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Create%20Order%20API); [Inquiry QR Transaction API (portal snippet)](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Inquiry%20QR%C2%A0%20Transaction%C2%A0%20API)
- หน้า "Create Order API" ระบุ integration methods: Embedded UI (card, QR code, Smart installment...) — [Create Order API](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Create%20Order%20API)
- QR Payment product มีหมวด: เริ่มต้นการใช้งาน, ขั้นตอนสมัคร, Thai QR branding, อัตราค่าบริการ, FAQs, Documentation (การยืนยันตัวตน...) — [QR Payment landing](https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Introduction)
- KGP Merchant Payment Platform มีหัวข้อ: เริ่มต้นใช้งาน, ขั้นตอนสมัคร, ลักษณะให้บริการ, FAQ, Documentation (ยืนยันตัวตน, Onboarding, สร้างข้อมูลผู้ขาย, ตรวจสถานะ, สร้างร้านค้า...) — [KGP Merchant Payment Platform](https://apiportal.kasikornbank.com/product/public/All/KGP%20Merchant%20Payment%20Platform/Try%20API)
- คู่มือเก่า K-Payment Gateway (PDF v0.5, 2016, ผ่าน Amarinbooks mirror): ตั้ง payment_method="QR" + Order ID ใน KPAY SDK เพื่อแสดงหน้า QR — [Merchant Integration Guideline v0.5 (PDF)](http://www.amarinbooks.com/wp-content/plugins/0/wc-kasikorn-gateway/_documents/Merchant_Integration_Guildeline%20v.0.5.pdf)
- Community SDKs (ไม่ใช่ทางการ): kbank-kapi-php — [farzai/kbank-kapi-php](https://github.com/farzai/kbank-kapi-php); kbank-sdk (PHP) — [bilions-org/kbank-sdk](https://github.com/bilions-org/kbank-sdk); C# SDK for KAPI QR — [GPoon21.KAPI.SDK](https://github.com/gpoon21/GPoon21.KAPI.SDK); open-api playground — [mzget/kbank-open-api-playground](https://github.com/mzget/kbank-open-api-playground)

### Inferences
- Endpoints บางชื่อ (Create Order/Charge, Inquiry/Void/Cancel QR, Payment Link) ชี้ว่า K Payment Gateway เป็นรุ่นใหม่กว่า KPAY SDK ปี 2016; คู่มือ 2016 ควรถือว่า deprecated
- "Try API" บน portal อาจต้อง login ก่อนเรียก sandbox จริง

### Gaps
- ดึงเนื้อหาเต็มของ API reference ไม่ได้ (portal เป็น JS app; webfetch ได้แค่ shell) — ไม่เห็น request/response schema, auth header, webhook, Postman collection, หรือ OpenAPI spec URL
- ไม่พบ SDK/postman collection ทางการบน portal จากผลค้นหาแบบไม่ login
- ไม่ยืนยันว่า sandbox เปิดให้สมัครเองได้ฟรีหรือต้องผ่านการอนุมัติก่อน

## QR products / fees (ผลิตภัณฑ์ + ค่าธรรมเนียม)

### Takeaway
ผลิตภัณฑ์ QR ที่พบ: Thai QR / QR API (dynamic), QR รับบัตรเครดิต, PromptPay QR, Cross-border QR; ค่าธรรมเนียม QR ระดับ merchant form ระบุ 0.35% หรือ 5 บาท/รายการ (หรือตามตกลง) แต่โปรโมชัน/ช่วงเวลาอาจเปลี่ยน ต้องเช็กกับธนาคาร

### Cited Findings
- KBank QR API รองรับ "ชำระเงินผ่าน QR Code ได้จากทุกธนาคาร ทั้ง Thai QR และ QR รับบัตรเครดิต" — [KBank QR API (TH)](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx)
- K SHOP ระบุ "QR รับบัตรเครดิต ธนาคารกสิกรไทย" เป็นประเภทย่อย — [K SHOP](https://www.kasikornbank.com/th/business/sme/digital-banking/kshop/pages/index.aspx)
- KGP รับ: cards, installments, e-wallets, mobile banking, PromptPay QR, Online Direct Debit, payment links, payouts — [KGP](https://www.kasikornglobalpayment.com/en)
- แบบฟอร์ม EDC (EN PDF): "QR Code Payment (for registered business/limited company/public limited company). 0.35% or 5 Baht per transaction, or as agreed between..." — [K-Merchant Application (PDF)](https://www.kasikornbank.com/th/business/sme/financial-services/collection-solutions/Documents/EDC_ApplicationForm_EN.pdf)
- Cross-border QR: KBank มี "Cross-Border QR Payment Service between Thailand..." ร้านค้ารับเป็นบาทตามราคาจริง ไม่กังวลอัตราแลกเปลี่ยน — [KBank news (Lao QR)](https://www.kasikornbank.com/en/news/pages/lao_qr.aspx)
- BentoWeb: ยอด QR รวมโอนเข้าบัญชีร้าน ~23:00 ทุกวัน + อีเมลสรุป ~04:00 วันถัดไป — [BentoWeb help](https://help.bentoweb.com/th/article/qr-payment-ape0g5/)
- T&C e-commerce (K-Payment Gateway merchant form): มี installment fee ตามตกลง (รายละเอียดบัตร) — [Merchant Application Form for KBANK e-Commerce (PDF)](https://www.kasikornbank.com/en/Download/Pages/TermAndCondition/TC_KPaymentGateway.pdf)

### Inferences
- QR 3 กลุ่มหลัก: (1) Thai QR/PromptPay (บัญชี), (2) QR รับบัตรเครดิต, (3) Cross-border QR — ค่าธรรมเนียมและ settlement ต่างกัน
- ตัวเลข 0.35%/5 บาท มาจากฟอร์ม EDC อาจไม่ตรงกับ QR API online ปัจจุบัน — ใช้เป็นจุดอ้างอิงแล้วต้องยืนยันกับ KBank/KGP

### Gaps
- ไม่พบตารางค่าธรรมเนียม QR API ปัจจุบัน (2026) บน official pages ที่ดึงได้; หน้า portal มีหัวข้อ "อัตราค่าใช้บริการ QR Payment" แต่ดึงเนื้อหาไม่ได้
- ไม่พบความต่างแบบละเอียด (วงเงิน, settlement T+?, refund/void, อายุ QR) จาก official docs แบบไม่ login

## Support / Thai guides (ติดต่อ + คู่มือไทย)

### Takeaway
ช่องทางติดตาม QR API: KBIZ Call Center 02-888-8822; ฝั่ง KGP มี support center 02-008-8820 (24 ชม.) + อีเมลแยกตามกลุ่ม; คู่มือไทยหลักคือหน้า kasikornbank.com + portal (TH) + คู่มือ platform (BentoWeb ฯลฯ)

### Cited Findings
- KBIZ Call Center โทร. 02-888-8822 (กด 1 > 3 > 0) สำหรับติดตามสถานะสมัคร QR API — [BentoWeb help](https://help.bentoweb.com/th/article/qr-payment-ape0g5/)
- KGP Support Center 02-008-8820, 24 ชม.; อีเมล Meta Pay merchants: customerservice@kasikornglobalpayment.com; other merchants: partnersupport@kasikornglobalpayment.com; สนใจบริการ: info.kgp@kasikornglobalpayment.com; ที่อยู่ Gaysorn Amarin — [KGP](https://www.kasikornglobalpayment.com/en)
- คู่มือไทย: หน้า QR API (TH) บน kasikornbank.com — [KBank QR API (TH)](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx); portal มีเนื้อหาภาษาไทยปนอังกฤษ — [K Payment Gateway](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference)
- คู่มือ OAuth ภาษาไทยโดย KBTG Life (ep.2) — [KBTG Life](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)

### Inferences
- แยก 2 สาย: ปัญหา QR API/บัญชี KBank → KBIZ 02-888-8822; ปัญหา KGP online payment → 02-008-8820 + อีเมล partnersupport

### Gaps
- ไม่พบ URL ฟอร์มสมัครตรง (deep link) ของ QR API — หน้าเว็บหลักเป็น JS อาจต้องเปิดด้วยเบราว์เซอร์จริง
- ไม่พบช่องทาง dev support เฉพาะ (เช่น dev forum, LINE OA สำหรับ developer) บน official docs ที่เข้าถึงได้
