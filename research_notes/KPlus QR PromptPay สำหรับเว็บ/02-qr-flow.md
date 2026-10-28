# Thai QR PromptPay Payment Flow — KBank Web + Backend Integration

## Create QR API — request/response fields, amount limits, expiry handling?

### Takeaway
KBank K Payment Gateway exposes a QR order API (Create Order + Inquiry QR) plus per-charge expiry; scheme-level PromptPay rails cap amounts (~THB 150k–2M depending on rail/aggregator) while KBank order payload itself is amount+currency+referenceOrder driven.

### Cited Findings
- KBank K Payment Gateway product lists dedicated endpoints: "Create Order API", "Inquiry Order API", "Inquiry QR Transaction API", "API for QR Payment" — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Create%20Order%20API)
- KBank QR order creation endpoint (dev) is `POST https://dev-kpaymentgateway-services.kasikornbank.com/qr/v2/order` — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Create%20Order%20API)
- KBank API portal requires an API key / token parameter ("required parameter in which the KBank Open API accesses the token", developer email tied to registered client app) — [Source](https://apiportal.kasikornbank.com/product/public/LandingPage/QR%20Payment/Try%20API)
- Community PHP SDK for KBank gateway shows core charge fields: `paymentType` (`qr` | `alipay` | `unionpay` | `card`), `amount`, `currency` (THB only), `description`, `referenceOrder` (unique order number), `token` (card only); QR flow uses `getQRPaymentOrderId()` and `getCharge($chargeId)` — [Source](https://github.com/bilions-org/kbank-sdk)
- KBank Embedded-UI (Smart Pay / kpayment.min.js) integration passes `data-apikey`, `data-amount`, `data-payment-methods="qr"`, `data-order-id`, `data-name`, `data-show-button` and calls `KPayment.show()` — [Source](https://github.com/bilions-org/kbank-sdk)
- Omise/Opn PromptPay (same BOT rails, useful reference for expiry semantics): charge = create source (`type=promptpay`, `amount` in subunits, `currency=THB`) then create charge with matching amount/currency; QR image returned at `charge.source.scannable_code.image.download_uri` (`qrcode.svg`) plus `authorize_uri` — [Source](https://www.omise.co/promptpay)
- Omise PromptPay QR default expiry is 24 hours after creation; merchant can request a shorter default (e.g. 5 min) via support, or per-charge override via `expires_at` timestamp (countdown starts after QR generation, max 24h) — [Source](https://www.omise.co/promptpay)
- Stripe PromptPay: merchant shows QR at checkout, customer scans with bank app and authorizes; Stripe confirms instantly — [Source](https://docs.stripe.com/payments/promptpay)
- PromptPay transfer fee tiers published by BOT: ≤5,000 THB free; 5,000–30,000 <2 THB; 30,000–100,000 <5 THB; >100,000 up to bank max <10 THB — [Source](https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html)
- Omise PromptPay limits: minimum 2000 subunits (THB 20.00), maximum 15000000 subunits (THB 150,000.00) — [Source](https://www.omise.co/promptpay)
- Xendit docs cite PromptPay max amount 700,000.00 with user-approval flow — [Source](https://docs.xendit.co/docs/qr-promptpay)
- Stripe FAQ cites PromptPay maximum 2,000,000 THB per transaction — [Source](https://support.stripe.com/questions/promptpay-faq)
- KBank direct-to-bank pattern per Thai QR overview: APIs "create both static and dynamic QR codes", refunds "up to THB 2M per transaction" cited as bank-direct capability — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)
- PromptPay payload currency is always `764` (THB) and country always `TH` in EMVCo/Thai-QR TLV model — [Source](https://thai-qr-payment.js.org/reference/spec/)

### Inferences
- Web+backend sequence for KBank: (1) backend calls Create Order with apikey/MID/TID + amount + referenceOrder, (2) backend returns QR payload/image or orderId to web frontend, (3) frontend renders QR (image or Embedded UI), (4) customer scans with any Thai bank app. Amount limits enforced at two layers: gateway validation and BOT/bank rail caps.
- Expiry must be treated as a first-class field: even if KBank portal docs are JS-gated, aggregator precedent (24h default, per-charge `expires_at`) suggests KBank Inquiry/Cancel APIs exist precisely to handle "Requested but never paid" cleanup.

### Gaps
- KBank API portal pages are JavaScript-rendered; `webfetch` returned only "K APi" stub, so exact KBank Create-QR JSON field names, HTTP headers, and per-field validation could not be verified — need KBank PDF/API spec or sandbox capture.
- No reliable source found for KBank-specific QR amount min/max and QR TTL options; only aggregator (Omise/Stripe/Xendit) and BOT fee-tier figures available.

## Status check — inquiry/polling vs webhook/callback, signature verification?

### Takeaway
Canonical pattern is webhook-first (KBank pushes event on customer confirmation) with Inquiry API as fallback/polling; webhook authenticity relies on pre-registered URL + shared secret rather than per-payload bank signature.

### Cited Findings
- KBank gateway sends `HTTP POST` with event every time customer confirms a QR payment ("WebHook Notify API for QR Payment ... ทุกครั้งที่ลูกค้ายืนยันการชำระเงิน ... จะส่งคำขอ HTTP POST พร้อมกับ event") — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/WebHook%20Notify%20API%20for%20QR%20Payment)
- KBank exposes separate webhook endpoints per rail: "WebHook Notify API for Card Payment", "WebHook Notify API for QR Payment", "WebHook Notify API for Alipay", "WebHook Notify API for Payment Link" — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Inquiry%20QR%C2%A0%20Transaction%C2%A0%20API)
- KBank sample-code hub notes: when merchant receives WebHook Notify from K Payment Gateway (HTTP POST) then ... (Thai) — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/Others/%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%AD%E0%B8%A2%E0%B9%88%E0%B8%B2%E0%B8%87%E0%B9%82%E0%B8%84%E0%B9%89%E0%B8%94)
- KBank dedicated status endpoint exists: "Inquiry QR Transaction API" alongside "Inquiry Order API" / "Inquiry Transaction API" / "Inquiry Payment Link API" — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Inquiry%20QR%C2%A0%20Transaction%C2%A0%20API)
- PortOne (KBank aggregator) integration requires out-of-band webhook registration: copy webhook URL from dashboard and share with KBank team to configure for your account; card/Alipay/UnionPay also need a callback URL shared with KBank — [Source](https://docs.portone.cloud/docs/k-bank)
- Omise reference flow: charge starts `pending`; on completion provider calls Omise, Omise sends `charge.complete` webhook POST (`key=charge.complete`, `data`=charge object); merchant must then GET charge by id and compare `status` (`successful`/`failed`/`expired`) before fulfilling — [Source](https://www.omise.co/promptpay)
- Stripe PromptPay: customer-initiated confirmation; merchant receives confirmation "instantly" (webhook-driven in Stripe model) — [Source](https://stripe.com/payment-method/promptpay)
- Thai QR integration guidance: dynamic QR gives "real-time webhook notifications for automated payment confirmation"; static QR requires manual confirmation or slip-scanning via ITMX API — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)
- Recommended hardening: whitelist webhook IP ranges and verify signatures where provided; log every `transaction_id`, amount, promptpay_id and webhook payload; test webhook reliability/timeout scenarios — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)

### Inferences
- Recommended backend sequence: (1) create order → store `referenceOrder ↔ orderId` mapping as `pending`, (2) await webhook; on receipt, idempotently mark paid only after calling Inquiry API to re-read status, (3) background poller sweeps `pending` orders past TTL via Inquiry API and cancels/expires them. Webhook alone is not trusted as sole source of truth.
- KBank-specific trait vs generic PromptPay: generic EMVCo payload has no callback concept — finality signal comes from the acquiring bank/gateway webhook, which is why KBank requires pre-registered webhook/callback URLs per merchant account rather than per-request `return_url`.

### Gaps
- No source found confirming KBank webhook payload schema, HMAC/JWT signature header name, or replay protection — KBank portal sample-code page is JS-gated. Needs sandbox webhook capture.
- No source found on KBank webhook retry policy (intervals, max attempts) or Inquiry rate limits.

## Error codes, timeout/duplicate handling, idempotency?

### Takeaway
KBank documents distinct Cancel vs Void QR APIs gated on order state, plus token-auth errors; generic PromptPay failure modes are processing failure, insufficient balance/limit, and payer cancellation — with duplicate-submission safety via unique `referenceOrder`/single-charge semantics.

### Cited Findings
- KBank has "Cancel QR Transaction API สำหรับยกเลิกคำสั่งซื้อสินค้าด้วย QR ซึ่งสถานะของรายการจะต้องมีสถานะเป็น Requested" (cancel only when status = Requested) — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Cancel%20QR%C2%A0Transaction%20API)
- KBank has "Void Transaction API สำหรับการยกเลิกรายการชำระเงิน ซึ่งสถานะของรายการจะต้องมีสถานะเป็น Authorized โดยรายการ ... จะยังไม่ได้ถูกเรียกเก็บ (Settle)" (void only when Authorized and not yet settled) — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Void%20Transaction%20API)
- KBank "Others" error reference includes "Token was expired or cannot be found" / "Failed Authentication" and advises checking expiry date and retrying — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/Others)
- KBank API reference sample error text: "Token was expired or cannot be found" under Authentication Verification — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference)
- Omise PromptPay charge lifecycle states: `pending` → `successful` | `failed` | `expired`; failure codes: `failed_processing` (general), `insufficient_balance` (funds/limit), `payment_cancelled` (payer cancelled) — [Source](https://www.omise.co/promptpay)
- Omise `expires_at` past-due charges transition to `expired` and cannot be authorized late — [Source](https://www.omise.co/promptpay)
- Stripe warns repeat payment with same QR can debit customer again; excess funds are reimbursed to merchant balance and merchant must refund customer out-of-band — [Source](https://docs.stripe.com/payments/promptpay)
- Idempotency general practice (not KBank-specific): client sends unique Idempotency-Key per payment intent; on timeout retry with same key the gateway returns existing result instead of double-charging — [Source](https://www.facebook.com/blackcask/videos/answer-1-client-sends-a-unique-idempotency-key-with-every-payment-request2-payme/1008635902253727/)
- KBank SDK pattern uses merchant-generated unique `referenceOrder` (`uniqid()` in sample) as the de-duplication handle — [Source](https://github.com/bilions-org/kbank-sdk)

### Inferences
- Recommended duplicate/timeout handling: generate one `referenceOrder` (UUID) per checkout attempt; never reuse across retries of different intents; on network timeout after Create Order, call Inquiry (not a second Create) with same reference before deciding; enforce single-use QR display (disable rescan after success) given Stripe's double-debit warning.
- Cancel (Requested) vs Void (Authorized-but-unsettled) is a state machine, not interchangeable — backend must branch on Inquiry status before calling either.

### Gaps
- No KBank-published idempotency-key header or duplicate-`referenceOrder` error code found; unknown whether KBank returns a specific `DUPLICATE_ORDER` code or silently creates a second order.
- Full KBank error-code table (validation, bank-decline, timeout codes) not retrievable — portal "Others" error page is JS-gated.

## Settlement report, reconciliation files, refund/void support for QR?

### Takeaway
PromptPay QR is near-real-time credit to merchant account with next-step settlement via bank reports/dashboard; QR PromptPay itself is effectively non-refundable through most gateways (manual out-of-band refund), unlike card QR/void flows.

### Cited Findings
- PromptPay launched 2016 as payment-system infrastructure for transfers via citizen ID / mobile number; BOT oversees framework, NITMX/ITMX operates switching — [Source](https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html)
- PromptPay sends "settlement confirmation almost instantly, notifying recipients within seconds that funds have arrived" — [Source](https://fintechnews.sg/131823/thailand/promptpay-as-a-blueprint-to-modernize-trade-finance-and-infrastructure/)
- PortOne refund matrix for KBank PG: PromptPay column shows ✕ for void (full refund before settlement), ✕ for partial refund, ✕ for multiple refunds — while cards/others show ✓ — [Source](https://docs.portone.cloud/docs/k-bank)
- Omise: "PromptPay charges cannot be voided or refunded through Omise" — [Source](https://www.omise.co/promptpay)
- KBank Refund Transaction API is described for card settlement reversal ("ขอคืนเงินเข้าบัญชีผู้ถือบัตร ... หลัง Settlement") — i.e., card-oriented, not PromptPay transfer reversal — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Refund%20Transaction%20API)
- KBank Cancel QR (Requested state) and Void QR exist as pre-settlement undo paths — [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Cancel%20QR%C2%A0Transaction%20API); [Source](https://apiportal.kasikornbank.com/product/content/All/K%20PAYMENT%20GATEWAY/API%20Reference/Void%20Transaction%20API)
- Stripe uniquely supports PromptPay refunds/partial refunds, but via manual flow: Stripe emails customer to collect refund account info (account number of source bank account required), then processes automatically — [Source](https://docs.stripe.com/payments/promptpay)
- KBank sandbox provides a merchant dashboard with QR simulator (dev portal + test credentials) usable for reconciliation testing — [Source](https://docs.portone.cloud/docs/k-bank)
- Thai QR guidance: log every `transaction_id`, amount, promptpay_id, webhook payload for audit/refund; static-QR verification via slip APIs (ITMX, SlipOK, EasySlip) or bank-app mini-QR scan — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)

### Inferences
- Reconciliation design for KBank QR: primary key = `referenceOrder`; join three legs — (a) Create/Inquiry response, (b) webhook event, (c) bank settlement report/dashboard export by date + MID/TID. Any webhook-paid order missing from settlement file within T+1 should alert.
- Product implication: since QR PromptPay has no gateway refund, the shop's "void bill after QR paid" flow must be a manual bank transfer or store credit, recorded separately — never an automatic gateway reversal. This matches POS rules that shift reports must not be rewritten after close.

### Gaps
- No source found describing KBank settlement file format (CSV/MT940/API), cut-off times, or dashboard export fields for QR — needs KBank merchant operations guide.
- Whether KBank offers any PromptPay "refund via new transfer API" vs strictly manual is unconfirmed.

## Static vs dynamic QR, PromptPay vs credit QR?

### Takeaway
Static QR = reusable merchant identifier, amount entered by payer; dynamic QR = per-transaction payload with locked amount (Tag 01 `12`, Tag 54 amount) — PromptPay QR moves money via BOT/NITMX instant-transfer rails while credit-QR routes via card network with auth/capture/settle/refund semantics.

### Cited Findings
- BOT policy guideline: "Thai QR Code Payment Standard may be applied in the form of static QR code and dynamic QR code. For a static QR code, the image of QR code ..." (47-page standard) — [Source](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2562/EngPDF/25620084.pdf)
- EMVCo MPM: Point of Initiation tag 01 = static (multiple transactions) vs dynamic (unique per transaction) — [Source](https://www.linkedin.com/pulse/emv-merchant-qr-code-yogesh-chander-qifdc)
- Thai-QR library spec: Tag 01 `11` static / `12` dynamic, auto-flipped on amount presence; Tag 54 carries amount up to 9,999,999,999.99; Tag 53 always 764 THB; Tag 58 always TH — [Source](https://thai-qr-payment.js.org/reference/spec/)
- PromptPay merchant template lives under Tag 29 with AIDs `A000000677010111` (standard credit transfer) and `A000000677010114` (OTA one-time auth); BillPayment under Tag 30 with `...0112` domestic / `...012006` cross-border; addressable by mobile (`0066...`), national ID, e-Wallet ID, or bank account (bank code + acct no.) — [Source](https://thai-qr-payment.js.org/reference/spec/)
- Static QR: created once, reused, customer inputs amount manually, generatable offline with open-source libs; verification needs manual confirmation or slip-scanning API — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)
- Dynamic QR: fresh per transaction with embedded amount/merchant details, API-created (KBank QR API, Bangkok Bank, Omise), real-time webhook confirmation — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)
- Hong Kong FPS×PromptPay reference confirms same semantics: static PromptPay QR requires user to enter THB amount; dynamic QR pre-fills amount — [Source](https://fps.hkicl.com.hk/eng/fps/consumers/fps_x_promptpay_qr_payment.php)
- KBank gateway supports both card and QR payment types (`qr`, `card`, `alipay`, `unionpay`) with QR as THB-only PromptPay and cards as THB/USD — [Source](https://github.com/bilions-org/kbank-sdk)
- KBank card QR/redirect flow uses redirect URL + callback URL, while PromptPay QR uses displayed QR + webhook (per PortOne: callback URL for card/Alipay/UnionPay; webhook URL for all incl. QR) — [Source](https://docs.portone.cloud/docs/k-bank)
- Merchant-presented (shop shows, customer scans) vs customer-presented (customer shows, shop scans, e.g. MyPromptQR) modes both exist under BOT standard — [Source](https://seaindev.com/p/thailand-qr-code-payment-integration)
- EMVCo QR is "payload grammar ... issuers and acquirers still authorize and settle. A CRC-valid QR is instructions, not a payout" (Tag 63 CRC-16/CCITT-FALSE integrity only) — [Source](https://emvqrhub.com/learn/what-is-emv-qr/)

### Inferences
- For POS/web checkout always use dynamic QR (Tag 01=12 + Tag 54 amount + Tag 62 reference/bill number for reconciliation). Static QR is only suitable for tip-jar/counter-sticker flows where amount varies and verification is manual.
- PromptPay-vs-credit decision tree: PromptPay QR = instant push transfer, no chargeback/refund rail, payer-authenticated in bank app (low fraud); credit QR = card auth + settlement batch + void/refund/chargeback support but with MDR fees (~1.65% via Omise reference) — [Source](https://www.omise.co/promptpay)

### Gaps
- Cross-border PromptPay QR (PayNow/DuitNow/QRIS interop via Tag 30 `...012006`) fee/FX handling for KBank web checkout not researched — flagged for separate cross-border note.
