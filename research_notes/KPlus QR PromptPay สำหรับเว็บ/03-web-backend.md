# KPlus QR PromptPay สำหรับเว็บ/Backend

## Auth method? (OAuth2, API key, client certificate, mTLS?) Headers and token lifetimes?

### Takeaway
KBank Open API ใช้ OAuth2 Client Credentials + Two-Way SSL (mTLS) พร้อมกัน ไม่ใช่ API key อย่างเดียว: ขอ access token ด้วย Basic auth (consumer ID:secret) ผ่าน mTLS แล้วใช้ Bearer token เรียก API ต่อ โดย token มีอายุ ~30 นาทีและควร reuse; ส่วน K-Payment Gateway (KPG) รุ่นเก่าใช้ API key + MID/TID แทน

### Cited Findings
- KBank/KBTG ระบุว่า API หลายตัว (เช่น QR Payment, Slip Verification) ใช้โมเดล Business-to-Business/Host-to-Host และใช้ grant type "Client Credentials" เป็นหลัก — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- ขั้นตอนขอ token: จัดรูป `<Consumer ID>:<Consumer Secret>` → Base64 → ใส่ header `Authorization: Basic <base64>` + `Content-Type: application/x-www-form-urlencoded` + body `grant_type=client_credentials` — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%AD%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- ตัวอย่าง cURL ขอ token ผ่าน mTLS พร้อมกัน: `curl -v --key kbank.test.2.key --cert kbank.test.2.crt --location --request POST 'https://openapi-sandbox.kasikornbank.com/oauth/token' --header 'Authorization: Basic ...' --data-urlencode 'grant_type=client_credentials'` — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- นำ Access Token ไปใช้ต่อโดยใส่ header `Authorization: Bearer <access token>` ในทุก API call — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- Response มี field `expires_in` เป็นวินาที; ตัวอย่างอายุ token ~30 นาที และธนาคารขอให้ reuse token จนหมดอายุก่อนขอใหม่เพื่อ performance — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- EP.1 ของซีรีส์เดียวกันอธิบาย Two-Way SSL (mTLS ด้วย X.509 client cert) เป็นพื้นฐานก่อนขอ OAuth — [KBTG Katalyst](https://katalyst.kasikornbank.com/th/blog/Pages/api-with-kbank.html)
- ต้องรับ OAuth2 credentials (consumer ID + consumer secret) จาก KBANK Developer Portal ก่อน — [KBank API Portal – QR Payment auth](https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Documentation/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99)
- การขอ token ใช้ Basic authentication ส่ง consumer key เป็น username และ consumer secret เป็น password — [KBank API Portal – Corporate Fund Transfer Try API](https://apiportal.kasikornbank.com/product/public/All/Corporate%20%20Fund%20Transfer/Try%20API)
- K-Payment Gateway (คนละผลิตภัณฑ์กับ Open API QR Payment) ใช้ API key + MID/TID และ JS SDK: `<script src="https://dev-kpaymentgateway.kasikornbank.com/ui/v2/kpayment.min.js" data-apikey="..." data-amount="..." data-payment-methods="qr" data-order-id="...">` และ flow: backend เรียก Order API ได้ orderId → ฝังใน KPay UI → ลูกค้าสแกน QR → server เรียก Inquiry QR ยืนยันสถานะ — [bilions-org/kbank-sdk](https://github.com/bilions-org/kbank-sdk)

### Inferences
- Backend ต้องรองรับ mTLS (เก็บ .crt/.key, ต่อผ่าน TLS client cert ทุกครั้ง) + token cache (in-memory/Redis พร้อม refresh ก่อนหมดอายุ) ไม่ใช่แค่ยิง API key ตรง ๆ
- มี API 2 ตระกูลอย่าสับสน: (1) Open API QR Payment (OAuth2+mTLS, server-to-server สร้าง Thai QR) กับ (2) K-Payment Gateway (Order/Charge API + hosted KPay UI ด้วย apiKey/MID/TID)

### Gaps
- ไม่พบเอกสารสาธารณะเรื่อง token lifetime ปัจจุบัน (2026) ว่ายัง 30 นาทีหรือไม่ และไม่มีรายละเอียด scope/rate-limit ต่อ consumer ID — ต้องดูใน portal หลังสมัคร
- ไม่พบว่า production OAuth endpoint ต่างจาก sandbox อย่างไรนอกจาก hostname — ต้องยืนยันจากเอกสารหลัง login

## Sandbox vs production URLs, test QR apps, test cases?

### Takeaway
จุดเริ่มคือ `https://apiportal.kasikornbank.com` (สมัคร, รับ consumer ID/secret + cert, ทดลอง Try API); sandbox OAuth host ที่อ้างในบทความ KBTG คือ `https://openapi-sandbox.kasikornbank.com/oauth/token` ส่วน KPG ใช้ `dev-kpaymentgateway...` (test) กับ `kpaymentgateway-services...` (prod); การทดสอบจ่ายจริงใช้ mobile banking app ใดก็ได้สแกน QR (K PLUS, SCB Easy ฯลฯ) เพราะเป็นมาตรฐาร PromptPay/EMVCo กลาง

### Cited Findings
- พอร์ทัลหลัก: "KBANK OPEN API เป็นกลุ่มของ APIs ทางด้านการเงิน... Platform, Customer Profiles, Accounts data และ Financial..." สมัคร/ดูรายละเอียดที่พอร์ทัล — [KBank API Portal](https://apiportal.kasikornbank.com)
- หน้าผลิตภัณฑ์ QR Payment ("บริการรับชำระเงินผ่าน QR Code...ชำระได้ทุกธนาคาร") — [KBank API Portal](https://apiportal.kasikornbank.com)
- Sandbox token endpoint ตัวอย่าง: `https://openapi-sandbox.kasikornbank.com/oauth/token` — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%AD%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- ตัวอย่าง two-way-SSL sandbox อีก host: `https://openapi-test.kasikornbank.com/exercise/ssl` (gist ตัวอย่าง, ไม่ใช่ production) — [Gist: Golang Two-ways SSL](https://gist.github.com/chayakorn-a/7206dab5b57194454a641e814143f869)
- KPG Create Order API: prod `https://kpaymentgateway-services.kasikornbank.com`, dev `https://dev-kpaymentgateway-services...`, path `/qr/v2/order` (method POST); KPay UI prod/dev hosts แยกกัน — [KBank API Portal – Create Order API](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Create%20Order%20API); ตัวอย่าง UI dev host `https://dev-kpaymentgateway.kasikornbank.com/ui/v2/kpayment.min.js` — [bilions-org/kbank-sdk](https://github.com/bilions-org/kbank-sdk)
- PromptPay เป็นระบบกลางของ ธปท./ITMX ใช้เลขมือถือ/บัตรประชาชน/QR สแกนผ่าน mobile banking app ใดก็ได้; ไม่ผูกกับ K PLUS อย่างเดียว — [Bank of Thailand – PromptPay](https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html)
- มีคลิปสอน "การขอ QR code KBank และแบบทดสอบ KBank API 16 ข้อ" (ขั้นตอนขอ QR + quiz ก่อนใช้ API) — [YouTube](https://www.youtube.com/watch?v=e_zW6jyJAx8)
- สมัคร PromptPay ภาคธุรกิจต้องกรอกแบบฟอร์ม + ยื่นเอกสารผ่าน RM/สาขา — [KBank PromptPay for Business](https://www.kasikornbank.com/en/business/promptpay/pages/promptpay-for-business.aspx)

### Inferences
- Prototype เร็วสุด: สมัคร portal → เอา sandbox creds + cert → ทดสอบ OAuth/mTLS ด้วย Postman (ตั้ง client cert) → ทดสอบสร้าง QR → สแกนด้วยแอปธนาคารจริง (ยอดเล็ก ๆ) → ยืนยันด้วย inquiry API
- KPG มีเส้น test/prod แยกชัดเจนกว่า (dev- host) จึงเหมาะกับ web checkout prototype ที่อยากเห็น UI ก่อน ส่วน Open API QR เหมาะกับ backend ที่ออก QR เอง

### Gaps
- ไม่พบ URL sandbox/production ของ QR Payment Open API แบบครบทุก endpoint ในเอกสารสาธารณะ (ต้อง login portal ดู "Try API" ของแต่ละผลิตภัณฑ์)
- ไม่พบชุด test case อย่างเป็นทางการ (test QR apps, หมายเลขทดสอบ, จำนวนเงินทดสอบ) แบบที่ Omise/Stripe มี dashboard ปุ่ม mark successful/failed — KBank น่าจะใช้ QR จริง + สแกนจริง

## Sample backend code (Node/Python/PHP) for create QR + webhook handler?

### Takeaway
ไม่มี official SDK สาธารณะที่เด่นชัด แต่มี community SDK 3 ตัว (PHP 2 ตัว, Python 1 ตัว) + JS lib สำหรับ static PromptPay QR (dtinth/promptpay-qr) ใช้ทำ prototype ได้ทันทีโดยไม่ต้องรอ KBank; ส่วน dynamic QR แบบมี order/notification ต้องใช้ API ของ KBank หรือ aggregator (Omise/Stripe)

### Cited Findings
- PHP SDK (K-Payment Gateway): ตั้ง `paymentType='qr'`, `amount`, `currency='THB'`, `referenceOrder`, แล้วเรียก `getQRPaymentOrderId()` / `getCharge($chargeId)`; frontend ฝัง KPay JS — [bilions-org/kbank-sdk](https://github.com/bilions-org/kbank-sdk)
- PHP SDK (KBank Open API, unofficial, WIP): `ClientBuilder::make()->setConsumer(id, secret)->asSandbox()->build()`, สร้างคำขอด้วย `QrPayment\Requests\RequestThaiQRCode` (setMerchant, setPartner(partnerTxnID, partnerID, partnerSecret, requestDateTime), setAmount, setReferences, setTerminal), ส่งด้วย `$client->qrPayment->sendRequest($request)`; รับ webhook ด้วย `$client->processWebhook(new QrPayment\PaymentNotificationCallback)` ซึ่ง "automatically validate your request" — [farzai/kbank-kapi-php](https://github.com/farzai/kbank-kapi-php); เอกสารเต็ม [GitBook](https://farzai.gitbook.io/kbank-kapi-php)
- สถานะ SDK ข้างบน: ยัง WIP, roadmap เหลือ OAuth2 auth, test suite, webhook callback, two-way SSL — [farzai/kbank-kapi-php](https://github.com/farzai/kbank-kapi-php)
- Python: `thanakan` — "Python Interface for Thai Bank API, KBANK, SCB, QR Code and slip verification" แต่เน้น slip verification; หมายเหตุว่าใช้ bank API ตรง ๆ "tedious and high upfront (50k or 10k min per month)" และแนะนำทางเลือก dev-friendly อย่าง check-slip.com (ฟรี 100 ใบแรก) / slipok.com (ฟรี 100/เดือน) — [codustry/thanakan](https://github.com/codustry/thanakan)
- Reference implementation เก่า: `mzget/kbank-open-api-playground` มีโฟลเดอร์ `twoway-ssl-sample` + demo `kbank-open-api.web.app` — [mzget/kbank-open-api-playground](https://github.com/mzget/kbank-open-api-playground)
- Static QR (ไม่ต้องขออนุมัติธนาคาร, ไม่มี callback อัตโนมัติ): lib `promptpay-qr` — `generatePayload(idOrPhoneNo, { amount })` คืน EMVCo payload เอาไป render เป็น QR; CLI `promptpay-qr 081-xxx-xxxx --amount 4.22`; เป็น PWA ทำงาน offline ไม่ส่งข้อมูลส่วนตัวขึ้น server — [dtinth/promptpay-qr](https://github.com/dtinth/promptpay-qr); สอนทีละขั้นภาษาไทย — [Medium: วิธีทำ Prompt-pay QR แบบง่าย](https://medium.com/i-gear-geek/%E0%B9%81%E0%B8%99%E0%B8%B0%E0%B8%99%E0%B8%B3%E0%B8%A7%E0%B8%B4%E0%B8%98%E0%B8%B5%E0%B8%97%E0%B8%B3-prompt-pay-qr-code-%E0%B9%81%E0%B8%9A%E0%B8%9A%E0%B8%87%E0%B9%88%E0%B8%B2%E0%B8%A2-%E0%B9%86-step-by-step-e67ddacf36af); ตัวอย่าง NextJS — [Amiearth blog](https://amiearth.com/blog/nextjs-generate-promptpay-qrcode)
- Omise (Node/cURL/PHP ทุกภาษา): สร้าง source `type=promptpay` ด้วย public key ฝั่ง client → สร้าง charge ด้วย secret key ฝั่ง server (`POST https://api.omise.co/charges -u $OMISE_SECRET_KEY -d amount -d currency=THB -d source=$SOURCE_ID` หรือ one-call `-d "source[type]=promptpay"`); QR image อยู่ที่ `charge.source.scannable_code.image.download_uri`; หมดอายุ default 24 ชม. ปรับได้ด้วย `expires_at` — [Omise: PromptPay](https://www.omise.co/promptpay)
- Stripe: เปิด PromptPay ที่ Dashboard → ใช้ Checkout/Elements/Payment Links (ไม่ต้อง integrate แยก); webhook แจ้งทันทีเมื่อลูกค้าสแกนจ่าย; รองรับ refund ผ่าน Dashboard/API แต่ลูกค้าต้องให้เลขบัญชีคืนเงิน — [Stripe: PromptPay payments](https://docs.stripe.com/payments/promptpay)
- 2C2P: มี "QR Payment" ทั้ง SDK method และ Direct API method (Payment Token API ด้วย MerchantID + secret + currencyCode) — [2C2P SDK QR Payment](https://developer.2c2p.com/docs/sdk-method-qr-payment); [2C2P Direct API QR Payment](https://developer.2c2p.com/docs/direct-api-method-qr-payment)

### Inferences
- แผน prototype 3 ชั้น: (1) เร็วสุดใช้ `promptpay-qr` ออก static QR + ตรวจสลิปด้วย slipok/check-slip (2) กลางใช้ Omise/Stripe/2C2P ได้ dynamic QR + webhook พร้อมใช้ในวันเดียว (3) ตรงกับ KBank เมื่อต้องการ settlement เข้าบัญชี KBank โดยตรงและผ่าน onboarding แล้ว
- ตัวอย่าง PHP ของ farzai ให้โครง request ที่ใกล้เคียงของจริงที่สุด (merchant/partner/terminal/references/metadata) ควรใช้เป็น checklist field ตอนอ่านเอกสารจริงใน portal

### Gaps
- ไม่พบตัวอย่าง Node/Python อย่างเป็นทางการสำหรับ KBank QR Open API (มีแต่ PHP community + gist Golang mTLS); ต้องดัดแปลงจาก cURL ใน KBTG blog
- ไม่พบสเปก webhook/notification ของ KBank QR แบบละเอียดในที่สาธารณะ (field, retry, signing) — farzai อ้างว่ามี validation แต่โค้ดยัง WIP

## Security checklist: webhook signature, IP allowlist, HTTPS, secret storage, PCI/scope for QR-only?

### Takeaway
มาตรการบังคับจากฝั่ง KBank คือ mTLS + OAuth2 + reuse token; ส่วนมาตรการฝั่ง merchant (verify webhook, HTTPS, เก็บ secret, idempotency, polling ยืนยันยอด) ต้องยืมแนวปฏิบัติจาก Omise/Stripe/Bangkok Bank (signature + Request-Ref + Transmit-Date-Time) เพราะ KBank ไม่ได้เปิดเผยสเปก webhook ลงที่สาธารณะ; ข่าวดีคือ QR-only ไม่แตะบัตร จึงไม่อยู่ในขอบเขต PCI DSS เต็มรูปแบบ

### Cited Findings
- Two-Way SSL ด้วย X.509 client cert ผ่าน HTTPS port 443 ช่วยธนาคารคุมสิทธิ์ราย client — [KBTG Katalyst](https://katalyst.kasikornbank.com/th/blog/Pages/api-with-kbank.html)
- KBank ขอให้ reuse access token ภายในอายุ (~30 นาที) แทนการขอใหม่ทุกครั้ง — [KBTG Life EP.2](https://medium.com/kbtg-life/%E0%B8%95%E0%B9%88%E0%B8%AD-api-%E0%B8%81%E0%B8%B1%E0%B8%9A-kbank-%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B8%81%E0%B8%B1%E0%B8%99%E0%B8%81%E0%B8%B1%E0%B8%9A-ep-2-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%A2%E0%B8%B7%E0%B8%99%E0%B8%A2%E0%B8%B1%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%95%E0%B8%99%E0%B8%9C%E0%B9%88%E0%B8%AD%E0%B8%99-oauth-2-0-b8c01ea9f5bc)
- แนวปฏิบัติธนาคารไทยเจ้าอื่น (ใช้เทียบ): Bangkok Bank QR API ส่ง `Authorization: Bearer`, `Signature`, `Request-Ref`, `Transmit-Date-Time` ทุกคำขอ — [Bangkok Bank QR Payment docs](https://apiportal.bangkokbank.com/en/api/qr-payment/api-documents)
- Omise แนะนำ: หลังได้ webhook `charge.complete` ให้ GET charge ซ้ำด้วย id เพื่อยืนยัน `status` ก่อนสรุปผล; failure codes เช่น `failed_processing`/`insufficient_balance`/`payment_cancelled` — [Omise: PromptPay](https://www.omise.co/promptpay)
- Stripe เตือน: QR ที่ใช้แล้วห้าม reuse — ลูกค้าสแกนซ้ำอาจถูกตัดเงินซ้ำ; เงินเกินจะคืนเข้า balance แล้ว merchant ต้องคืนลูกค้านอกระบบเอง — [Stripe: PromptPay payments](https://docs.stripe.com/payments/promptpay)
- Omise: PromptPay charge "cannot be voided or refunded through Omise" — [Omise: PromptPay](https://www.omise.co/promptpay); ตรงข้าม Stripe ที่ refund ได้แต่ต้องขอเลขบัญชีลูกค้า — [Stripe: PromptPay payments](https://docs.stripe.com/payments/promptpay)
- Omise มี docs เฉพาะ: Security Best Practices, API IPs (allowlist), Webhooks, Rate limiting, Versioning — [Omise docs index](https://www.omise.co/promptpay) (เมนูลิงก์ท้ายหน้า)
- `promptpay-qr` ย้ำว่า PromptPay ID อยู่บนเครื่องผู้ใช้ ไม่ส่งขึ้น server — [dtinth/promptpay-qr](https://github.com/dtinth/promptpay-qr) (หลักการลด exposure ใช้ได้กับ merchant เช่นกัน: อย่า log เลขบัญชี/QR payload เกินจำเป็น)

### Inferences
- Checklist ขั้นต่ำสำหรับ backend: (1) เก็บ consumer secret + .key ใน secrets manager/env ไม่ commit (2) mTLS ทุก call + verify server cert (3) cache token + clock-skew เผื่อ (4) webhook: verify signature/partnerSecret, idempotency key = partnerTxnUid/reference, ตอบ 200 เร็วแล้วค่อยประมวลผล async (5) ยืนยันยอดด้วย inquiry API ก่อน fulfill (อย่าเชื่อ callback อย่างเดียว) (6) QR ต่อ order ครั้งเดียว + มี expiry + ห้าม reuse (7) HTTPS เท่านั้น + HSTS (8) IP allowlist ถ้า KBank ให้มา (9) audit log + alert ยอดไม่ตรง (10) QR-only ไม่มีเลขบัตรผ่านระบบ → นอก scope PCI DSS แต่ยังต้องดูแล PDPA/ธปท.
- ถ้าใช้ static QR + slip verification ต้องบวกเช็กกันปลอมสลิป (OCR/QR verify ผ่าน slipok/check-slip API) และ reconcile ยอด/เวลา/ชื่อผู้รับ

### Gaps
- ไม่พบสเปกทางการของ KBank เรื่อง webhook signing algorithm, IP allowlist, retry policy, และ error codes ของ QR Payment — ต้องขอจากเอกสารหลังอนุมัติ/ทีม KBank
- ไม่พบคำยืนยันทางการว่า QR-only ยกเว้น PCI อย่างไร — อ้างจากหลักทั่วไป (ไม่มี cardholder data) ไม่ใช่เอกสาร KBank

## Common pitfalls from Thai dev community (Pantip, StackOverflow, Facebook groups, GitHub issues)? Alternatives if KBank onboarding is slow (Omise, Stripe, 2C2P that support KBank QR)?

### Takeaway
อุปสรรคหลักคือ onboarding (สมัครธุรกิจ + ขอ QR + quiz 16 ข้อ + mTLS/OAuth ครั้งแรก) ไม่ใช่โค้ด; นักพัฒนาจึงนิยมทางลัด static QR (promptpay-qr) หรือ aggregator ที่สมัครออนไลน์ได้เร็วกว่า (Omise 1.65%, Stripe, 2C2P) ซึ่งรองรับการจ่ายจากแอป K PLUS อยู่แล้วเพราะ QR เป็นมาตรฐานกลาง

### Cited Findings
- มี quiz "แบบทดสอบ KBank API 16 ข้อ" ก่อนใช้ API — [YouTube](https://www.youtube.com/watch?v=e_zW6jyJAx8)
- คู่มือ KPG รุ่นเก่า (2018) ยังถูกอ้างอิง แสดงว่าเอกสารกระจัดกระจายหลายเวอร์ชัน — [KPG Merchant Integration Guideline v0.5 (PDF)](http://www.amarinbooks.com/wp-content/plugins/0/wc-kasikorn-gateway/_documents/Merchant_Integration_Guildeline%20v.0.5.pdf)
- กลุ่ม Thai dev ถามเรื่อง "ระบบชำระเงินอัตโนมัติ KBANK บัญชีบุคคลธรรมดาผ่าน QR PromptPay + แจ้งเตือนไลน์" (ใช้บัญชีบุคคล + static QR + ต่อ LINE notify แทน webhook ธนาคาร) — [Facebook: Thai dev group](https://www.facebook.com/groups/thaidev/posts/976183533181177)
- Pantip มีประเด็นว่า QR ทำได้ไม่เท่ากันทุกธนาคาร (KBank ทำได้เลย เจ้าอื่นต้องใช้เบอร์/บัตรประชาชน) — [Pantip](https://pantip.com/topic/44195841/desktop)
- thanakan ระบุตรง ๆ ว่า bank API ตรง ๆ "tedious and high upfront (50k or 10k min per month)" — [codustry/thanakan](https://github.com/codustry/thanakan)
- Omise PromptPay: ค่าธรรมเนียม 1.65% ต่อรายการ, ขั้นต่ำ ฿20, สูงสุด ฿150,000, QR หมดอายุ default 24 ชม., ทดสอบใน dashboard ได้ (Actions → mark Successful/Failed) — [Omise: PromptPay](https://www.omise.co/promptpay); [Omise Pricing TH](https://www.omise.co/en/pricing/thailand)
- Omise มี Mobile Banking KBank (K PLUS) เป็นวิธีแยกจาก PromptPay QR ด้วย — [Omise: Mobile Banking KBank](https://www.omise.co/en/mobile-banking-kbank/international)
- Stripe: เปิด PromptPay ที่ Dashboard ได้เลย, รองรับ Checkout/Elements/Payment Links/Subscriptions(sendi_invoice)/Connect, แจ้งผล instant, รองรับ refund (ต้องขอเลขบัญชีลูกค้า) — [Stripe: PromptPay payments](https://docs.stripe.com/payments/promptpay); วิธีเปิด — [Stripe Support](https://support.stripe.com/questions/how-to-enable-promptpay)
- 2C2P: รองรับ QR Payment ทั้ง SDK และ Direct API; จดหมายข่าวสอน "Testing PromptPay QR Payment Flow" กับ mobile banking apps — [2C2P SDK](https://developer.2c2p.com/docs/sdk-method-qr-payment); [2C2P Direct API](https://developer.2c2p.com/docs/direct-api-method-qr-payment)
- ค่าธรรมเนียม Thai QR ภาคธุรกิจทั่วไป: นิติบุคคล ~0.35% หรือ 5 บาท/รายการ (แล้วแต่ตกลงกับธนาคาร) — [PaymentReview: fees 2026](https://paymentreview.com/blog/thailand-card-promptpay-payment-fees-2026)
- Pitfall ซ้ำจาก aggregator ที่ใช้กับ KBank ตรงได้: Omise คืนเงิน PromptPay ผ่านระบบไม่ได้; Stripe ห้ามใช้ QR ซ้ำ (ลูกค้าอาจโดนตัดเงินซ้ำ) — [Omise: PromptPay](https://www.omise.co/promptpay); [Stripe: PromptPay payments](https://docs.stripe.com/payments/promptpay)

### Inferences
- ถ้า onboarding KBank ช้า: prototype ด้วย Omise (test mode + dashboard simulate) หรือ Stripe (Dashboard toggle + test clock) เร็วสุด; 2C2P เหมาะถ้าต้องการ payment token/direct API คล้ายธนาคาร; production ค่อยย้ายมา KBank ตรงเมื่อต้องการค่าธรรมเนียมธุรกิจและ settlement KBank
- Pitfalls ที่ต้องเขียนในคู่มือ: (1) สับสน KPG vs Open API (2) ลืมต่อ mTLS ใน production (Postman ผ่านแต่ server จริงลืมติด cert) (3) ส่ง body ผิด (token endpoint ต้องเป็น x-www-form-urlencoded ไม่ใช่ JSON) (4) ขอ token ใหม่ทุก request จนโดน throttle (5) เชื่อ webhook อย่างเดียวไม่ inquiry ซ้ำ (6) reuse QR หลาย order (7) ยอด/สกุลเงินไม่ตรงกันระหว่าง source กับ charge (Omise) (8) ลืม handle expired/failed + แจ้งผู้ใช้

### Gaps
- ไม่พบเธรด Pantip/StackOverflow ที่ลงลึกเรื่อง KBank QR Open API error เฉพาะ (เช่น invalid signature, cert expired) — สัญญาณว่า community ตรงยังเล็ก องค์ความรู้อยู่หลัง portal/กลุ่มปิด
- ไม่พบตารางเปรียบเทียบค่าธรรมเนียม/เวลาอนุมัติล่าสุดของ KBank ตรง vs Omise/Stripe/2C2P — ต้องขอใบเสนอราคาปัจจุบัน
