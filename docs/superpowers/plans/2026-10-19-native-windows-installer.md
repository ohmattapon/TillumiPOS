# Native Windows Installer (.exe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ดับเบิลคลิกไฟล์ `.exe` ตัวเดียว ติดตั้ง TillumiPOS บน Windows ได้จบโดยไม่ต้องรู้จัก PowerShell/Podman/Docker — รัน native ตรง (Bun + PostgreSQL) เป็น Windows Service เปิดเครื่องติดเอง มี auto-update ในตัว

**Design decisions (grill 2026-10-19, user ตอบ):**
- Native ตรง ไม่ห่อ Podman/WSL2 (เบาเครื่องร้านมาก)
- ฝัง PostgreSQL binaries มากับ installer (ติดตั้ง offline ได้ ไฟล์ ~100-150MB)
- รันเป็น Windows Service ผ่าน WinSW (เปิดเครื่องติดเอง ไม่ต้องล็อกอิน)
- Auto-update ในตัว (ไม่เอาแบบรันทับเอง)
- หน้าจอขายยังเปิดในเบราว์เซอร์ (Chrome/Edge kiosk) — `.exe` คืองานติดตั้ง+service ไม่ใช่ตัว UI

**Architecture:** Inno Setup สร้าง `TillumiPOS-Setup-x.y.z.exe` ภาษาไทย ประกอบด้วย: API ที่ compile แล้ว (`bun build --compile`, fallback เป็น portable Bun ถ้า compile มีปัญหา), PostgreSQL Windows binaries zip, WinSW (2 services: `tillumi-postgres` → `tillumi-pos` มี dependency), layout `ProgramFiles\TillumiPOS\app-<version>\` + `ProgramData\TillumiPOS\` (data, .env, media, backups). ติดตั้งครั้งแรก: initdb cluster ใหม่, สุ่ม secrets เข้า `.env`, เปิด service, สร้าง shortcut kiosk + งาน backup รายคืน (Task Scheduler). อัปเดต: ไฟล์ feed JSON บน GitHub Releases → ปุ่ม "ตรวจอัปเดต" ฝั่งเจ้าของ → โหลด updater → ตรวจ SHA256 → หยุด service → วาง `app-<new>` → เก็บ `app-<old>` ไว้ 1 รุ่น (rollback) → สตาร์ท (migration รันเองตอนบูตอยู่แล้ว)

**Tech Stack:** Inno Setup (Pascal Script), WinSW, `bun build --compile`, PostgreSQL Windows binaries, Task Scheduler, Chrome/Edge kiosk shortcut

**Non-goals (รอบนี้):** รองรับ USB printer ตรง (ยัง LAN อย่างเดียว), ARM64 (x64 ก่อน), code signing cert (ดู "ของที่เจ้าของต้องจ่าย" ข้างล่าง), auto-update แบบ silent กลางคืน (กดเองก่อน)

## Owner prerequisites (ต้องใช้เงิน/บัญชีจริง)

- **Code signing certificate** (~หลักหมื่นบาท/ปี) ไม่งั้น Windows SmartScreen ขึ้นเตือนแดงตอนติดตั้ง — บล็อกการเอาไปให้ร้านจริง ไม่ใช่บล็อกงาน dev
- พื้นที่โฮสต์ไฟล์ installer + feed JSON (ใช้ GitHub Releases ได้ฟรี)

## Global Constraints

- ทำงานบน branch `ohmattpon/native-windows-installer` จาก `origin/main` ห้าม merge เข้า `main` ห้ามลบ branch
- commit ด้วย `gitcz --non-interactive` เท่านั้น ห้าม `git commit`/`--amend` ห้าม type `build`, stage เฉพาะไฟล์ของ concern นั้น
- ห้าม push เด็ดขาด รอเจ้าของ push เอง (เคยกดให้เฉพาะตอนเจ้าของสั่งชัด)
- สคริปต์ `.ps1` ห้ามเรียก secrets มาตรง ๆ ใช้ env; ไฟล์ installer ห้ามมีรหัสผ่านจริง (สุ่มตอนติดตั้ง)
- เงินเป็น satang integer; บิลห้ามแก้/ลบ; กฎ Hexagonal ฝั่ง server ไม่เปลี่ยน (งานนี้แตะแค่ edge: scripts + installer + update endpoint)
- ก่อนบอกเสร็จต้องผ่าน `bun run typecheck` + `bun run test` (DB ต้องรัน)

## Review Focus

1. **ข้อมูลร้านห้ามหายตอนอัปเดต:** data dir (`ProgramData`) แยกจาก app dir เด็ดขาด, uninstaller ถามก่อนลบข้อมูล, rollback ต้องบูตกลับรุ่นเก่าได้จริง (ทดสอบ)
2. **Secrets สุ่มหน้างาน:** `.env` สร้างตอนติดตั้งเท่านั้น ห้าม bake ลง installer; JWT/DB/media token ต้องสุ่ม (ใช้วิธีเดียวกับ `install.ps1`)
3. **Updater คือช่องโหว่ถ้าไม่มีลายเซ็น:** v1 ตรวจ SHA256 ผ่าน HTTPS จาก Releases ที่ pin ไว้ + เอกสารบอกชัดว่ารอ cert; ห้ามโหลดอัปเดตจาก URL ที่ user กรอกได้
4. **Service รันตอนยังไม่ล็อกอิน:** สิทธิ์เขียน data/backups ต้องเป็นของ service account ตั้งแต่ติดตั้ง, ทดสอบรีบูตแล้วขายได้โดยไม่ล็อกอิน

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `installer/tillumi.iss` | สคริปต์ Inno Setup (wizard ไทย, ฝัง payloads, เขียน .env+secrets, firewall checkbox, shortcut, Task Scheduler, uninstaller เก็บข้อมูล) |
| `installer/winsw/*.xml` | คอนฟิก 2 services (postgres → api dependency, log, restart on failure) |
| `installer/scripts/*.ps1` | initdb ครั้งแรก, backup/restore แบบ native paths, kiosk shortcut |
| `server/src/modules/update/**` | โมดูลใหม่: port `IUpdateFeed`, use cases ตรวจเวอร์ชัน/ดาวน์โหลด/ติดตั้ง (owner-only), controller + audit |
| `src/features/settings/**` | ปุ่ม "ตรวจอัปเดต" + สถานะเวอร์ชัน (th/en) |
| `docs/windows-installer.md` | คู่มือร้าน + หมายเหตุ cert |

---

### Task 1: พิสูจน์ native boot (spike, ยังไม่ทำ installer)

**Files:** ไม่ commit โค้ดถาวร (โน้ตผลลงแผน/แผนย่อย) — ทดสอบในโฟลเดอร์ชั่วคราวนอก repo
- `bun build --compile server/src/app.ts` (หาชื่อ entry จริงก่อน) → ได้ exe ไหม บูตขึ้นไหม login/ขายได้ไหม
- PostgreSQL Windows binaries zip → `initdb` → สตาร์ท → `db:migrate` + `db:seed` ผ่านไหม
- ถ้า compile ล้ม จดสาเหตุแล้วใช้แผนสำรอง portable Bun

**Dependencies:** ไม่มี
**Race risks:** อย่า commit ของชั่วคราวเข้า repo; อย่าแตะ DB จริงของ dev (ใช้ cluster ใหม่ใน TEMP)
**Verification:** exe+PG ใน TEMP ขาย 1 บิลผ่าน HTTP ได้ แล้วลบโฟลเดอร์ทิ้ง

---

### Task 2: service wrappers + layout + secrets หน้างาน

**Files:**
- Create: `installer/winsw/tillumi-postgres.xml`, `installer/winsw/tillumi-pos.xml` (dependency, working dir, log, restart)
- Create: `installer/scripts/first-install.ps1` (initdb ถ้ายังไม่มี cluster, สุ่ม secrets เขียน `.env`, สร้าง dirs, ตั้งสิทธิ์ service account)
- Create: `installer/scripts/backup-native.ps1`, `restore-native.ps1` (เรียก `pg_dump`/`psql` จาก embedded bin + media tar คู่กันแบบเดิม)

**Dependencies:** Task 1 (รู้ว่า exe บูตได้)
**Race risks:** สิทธิ์ไฟล์ของ service account (SYSTEM vs Dedicated user — เลือกอันเดียวแล้วใช้ทุกที่); พอร์ต 3000/5432 ต้องไม่ชนของเดิม (5432 อาจมี postgres อื่น — ใช้พอร์ตของเราเองเช่น 5435 + จดใน .env)
**Verification:** ติดตั้ง service ด้วยมือ (ไม่ผ่าน Inno) → รีบูต → ขายได้โดยไม่ล็อกอิน → backup/restore 1 รอบ

---

### Task 3: Inno Setup installer ภาษาไทย

**Files:**
- Create: `installer/tillumi.iss` (ดาวน์โหลด Inno Setup 6 + ISPP, ฝัง payloads, wizard ไทย: ต้อนรับ → โฟลเดอร์ → firewall/LAN checkbox → ติดตั้ง → เสร็จพร้อมปุ่มเปิดหน้าร้าน)
- Shortcut: kiosk Chrome (`--kiosk http://localhost:3000`, fallback Edge/default browser), Task Scheduler backup รายคืน, firewall inbound 3000 (เฉพาะตอนติ๊ก LAN), uninstaller ถามก่อนลบข้อมูล

**Dependencies:** Task 2
**Race risks:** ขนาดไฟล์ (~100-150MB) ตรวจว่า artifact อยู่ใน release ไม่ใช่ใน git (`.gitignore` + CI build); ทุกข้อความ wizard ต้องเป็นภาษาไทยที่ร้านอ่านรู้เรื่อง (ห้ามศัพท์ dev)
**Verification:** รัน installer บน Windows ใหม่ (VM/เครื่องทดสอบ) → จบ wizard → เปิด shortcut ขายได้ → uninstall (เลือกเก็บข้อมูล) แล้วติดตั้งซ้ำข้อมูลยังอยู่

---

### Task 4: auto-update (feed + owner UI + updater + rollback)

**Files:**
- Create: `server/src/modules/update/**` — port `IUpdateFeed` (ดึง feed JSON), `CheckUpdateUseCase` (query, เทียบ semver), `ApplyUpdateUseCase` (command, owner-only `settings.write`? หรือ permission ใหม่ — ถ้าใหม่ต้องเพิ่มคำแปล; แนะนำ reuse `settings.write` ไปก่อน), controller `GET /update/status`, `POST /update/apply`, audit `update.applied`
- Feed: `installer/feed.json` template + ขั้นตอน publish บน GitHub Releases (`{version, sha256, url}`)
- Updater: `installer/scripts/apply-update.ps1` (โหลด → ตรวจ SHA256 → หยุด services → วาง `app-<new>` → ชี้ service ไปรุ่นใหม่ → สตาร์ท → เก็บรุ่นเก่า 1 รุ่น; พัง = ชี้กลับ + สตาร์ท)
- Web: ปุ่มตรวจอัปเดต + แสดงเวอร์ชันปัจจุบันใน settings (th/en)

**Dependencies:** Task 3 (layout versioned dirs)
**Race risks:** ห้ามให้ client ส่ง URL มาเอง (feed URL fix ในโค้ด); ดาวน์โหลดต้อง HTTPS เท่านั้น; อัปเดตห้ามแตะ data dir; ทดสอบ rollback จริง (อัปเดตแล้วพัง → กลับรุ่นเก่าขายต่อได้)
**Verification:** อัปเดตข้าม 2 รุ่นจำลองบนเครื่องทดสอบ (รุ่นใหม่จงใจพัง 1 ครั้งเพื่อดู rollback) + `bun run openapi:check` (route ใหม่ต้อง additive)

---

### Task 5: docs + ปิดงาน

**Files:**
- Create: `docs/windows-installer.md` (ร้าน: ดับเบิลคลิก ตอบ wizard เปิด shortcut; ช่าง: service names, paths, ports, backup/restore, rollback, cert)
- Modify: `docs/install.md` 1-2 บรรทัดชี้ไป doc ใหม่ (ห้าม rewrite)
- ตรวจรวม: `bun run typecheck` + `bun run test` + `bun run lint` + ติดตั้งจริงบน Windows สะอาด 1 รอบ + รีบูต 1 รอบ

**Dependencies:** Task 4
**Race risks:** เอกสารต้องไม่มีคำสั่งที่ต้องพิมพ์เองเกินจำเป็น (กลุ่มเป้าหมายคือคนกลัว PowerShell)
**Verification:** คนที่ไม่เคยติดตั้ง (เจ้าของ) ทำตาม doc ได้โดยไม่ถาม

---

## ลำดับทำ + ขนานได้

- Task 1 → Task 2 → Task 3 → Task 4 → Task 5 ตามลำดับ (แตะชั้นเดียวกันทีละขั้น)
- ปิดงาน: typecheck + test + lint + ติดตั้งจริง + รีบูต + rollback drill

## นอกสโคปที่เจ้าของรับทราบแล้ว

- USB/Bluetooth printer, ARM64, code signing cert (เจ้าของจ่าย), silent auto-update กลางคืน, e2e บน installer
