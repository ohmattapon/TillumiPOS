# หน้ารวมผู้ใช้ + บทบาทและสิทธิ์ (role cards บน route `/users`)

## Goal

รวมหน้า "ผู้ใช้" กับ "บทบาทและสิทธิ์" เป็นหน้าเดียวแบบ role-centric: การ์ดรายบทบาท ใบละหนึ่งบทบาท
แสดงสมาชิก + ติ๊กสิทธิ์ในมุมมองเดียว โดยไม่แตะ API (endpoint, permission, กฎ owner/system role, audit เหมือนเดิม)

## Decisions (locked, grill 2026-10-18)

- Q1 B — หน้ารวมเดียว มองแบบ role-centric
- Q2 B — การ์ดรายบทบาท: สมาชิก + ติ๊กสิทธิ์ในมุมมองเดียว (dialog เป็นทางสำรองได้)
- Q3 A — ปุ่มเพิ่มผู้ใช้อยู่บนการ์ดแต่ละใบ กรอกบทบาทมาให้แล้ว ไม่มีปุ่มเพิ่มกลาง
- Q4 A — ติ๊กสิทธิ์ inline บนการ์ด
- Q5 B — dialog แก้ไขผู้ใช้เก็บช่องบทบาทไว้เป็นทางลัดย้ายผู้ใช้ข้ามบทบาท
- Q6 A — เพิ่ม/เปลี่ยนชื่อ/ลบบทบาทอยู่เมนู ⋯ บนการ์ด (เงื่อนไขลบเดิม: บทบาทระบบหรือมีผู้ใช้อยู่ลบไม่ได้)
- Q7 A — ใช้ route `/users` เดิม เมนูเดียว ไม่พังบุ๊กมาร์ก

## Approach

สร้าง `TeamPage` ใหม่ใน feature users (ไฟล์ใหม่ ไม่แก้ UsersPage/RolesPage ตรง ๆ แล้วลบไฟล์เก่าทิ้งตอนท้าย)
การ์ดแต่ละใบประกอบจากของเดิม: แถวสมาชิก reuse ลอจิก row action ของ UsersPage, ติ๊กสิทธิ์ reuse
`groupPermissions` + `useUpdateRole`, เมนูบทบาท reuse `RoleDialog` (สร้าง/เปลี่ยนชื่อ) + confirm ลบ,
เพิ่มผู้ใช้ reuse `UserFormDialog` โดยส่ง roleId ตั้งต้น (รองรับอยู่แล้ว: ฟอร์มมีช่อง role + default เป็น cashier)

## Assumptions

- การ์ดเพจทั้งหน้ายัง owner-only เท่าเดิม (guard บน route ไม่เปลี่ยน); ส่วนจัดการบทบาทแสดงเมื่อมี `roles.manage`
- ชื่อเมนู sidebar คง `nav.users` เดิม ไม่ตั้งชื่อใหม่ (นอกสโคป)
- ไม่เปลี่ยน API/signature ของ hooks เดิม (`usersQuery`, `roleOptionsQuery`, `useUpdateRole`, ฯลฯ)
- ข้อมูลที่ต้องใช้มีครบแล้ว: `users` มี `roleId`, roles list มี `userCount`
- Web rule: ข้าม feature ใช้ `@/features/<name>` (index) เท่านั้น ห้าม deep import

## Risks

- การ์ดแน่นบนมือถือ 390px: ติ๊กสิทธิ์แบบกลุ่ม + รายชื่อสมาชิกต้อง scroll แยกส่วน (ตรวจด้วย screenshots)
- `useUpdateUser` invalidate ทั้ง users + roles อยู่แล้ว ส่วน `useUpdateRole` invalidate roles + me — ติ๊กสิทธิ์บนการ์ดต้องเห็นยอดสมาชิกอัปเดต (roles query ถูก invalidate โดยทั้งสองฝั่งอยู่แล้ว)
- ลบ `RolesPage`/`UsersPage` แล้วต้องไม่มี import ค้าง (ตรวจด้วย grep + typecheck)

## Impact

- ลบ route `/roles` + เมนู sidebar หนึ่งรายการ; `/users` แสดง TeamPage
- เพิ่ม locale keys ใหม่ (ปุ่มเพิ่มผู้ใช้บนการ์ด, เมนูบทบาท); ไม่แตะ error codes (API ไม่เปลี่ยน)
- ไม่ต้อง migration / OpenAPI baseline (web-only, API เหมือนเดิม)

## Task overview (parallel-first)

| # | Task | Can run together | Must wait for | TDD slice |
|---|------|------------------|---------------|-----------|
| 1 | lib จัดสมาชิกตามบทบาท + test | 2, 3 | — | yes (pure) |
| 2 | TeamPage + การ์ด + แถวสมาชิก + ปุ่มเพิ่มรายใบ | 1, 3 | — | yes (lib first, JSX verified by typecheck + web tests) |
| 3 | ติ๊กสิทธิ์ inline + เมนู ⋯ บทบาท (reuse RoleDialog) | 1, 2 | — | yes (toggle logic via existing hook; behavior test where pure) |
| 4 | Shell: route/sidebar/i18n + ลบ UsersPage/RolesPage + locale keys | — | 2, 3 | docs/config exception + grep verify |
| 5 | Docs sweep + full verify | — | 4 | verify only |

Tasks 1–3 สร้างไฟล์ใหม่เป็นหลัก ไม่ทับกัน; Task 4 แตะไฟล์ shell ที่ tasks อื่นไม่แตะ แต่รอ 2–3 เสร็จเพื่อลบไฟล์เก่าได้ชัวร์

## Task 1 — lib จัดสมาชิกตามบทบาท

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

- RED: เขียน test ของ `groupMembersByRole(users, roles)` — คืนบทบาทตามลำดับ roles list พร้อม members ของแต่ละใบ
  (สมาชิกที่ roleId ไม่อยู่ใน list ไปกอง "unassigned" ท้ายสุด; owner แสดง `PERMISSIONS.length` ไม่เกี่ยวตรงนี้)
- GREEN: implement ใน `src/features/users/lib/group-members-by-role.ts` (pure, ไม่ import framework)
- REFACTOR: ตั้งชื่อตาม domain (member/role)

Files: create `src/features/users/lib/group-members-by-role.ts` + `.test.ts`.
Race risk: ไม่มี (ไฟล์ใหม่).
Verify: `bun test ./src/features/users/lib/group-members-by-role.test.ts`

## Task 2 — TeamPage + การ์ด + แถวสมาชิก + ปุ่มเพิ่มรายใบ

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

- RED: test Task 1 ต้องเขียวก่อน (reuse); สำหรับ JSX เขียน test ระดับ lib ของ logic ที่ดึงออกได้
  (เช่น prefill roleId ของ UserFormDialog มีอยู่แล้ว ไม่ต้องเพิ่ม)
- GREEN: สร้าง `src/features/users/components/TeamPage.tsx`:
  - ดึง `usersQuery` + `rolesQuery`/`roleOptionsQuery` (ผ่าน `@/features/roles` index เท่านั้น)
  - การ์ดใบบทบาท: ชื่อ + system badge (reuse pattern RolesPage) + จำนวนสมาชิก + ปุ่ม "เพิ่มผู้ใช้" เปิด `UserFormDialog` แบบ prefill role
  - แถวสมาชิก: ชื่อ/username/role/PIN/สถานะ + row action เดิมครบ (แก้ไข, ตั้ง PIN ผ่าน `canSetPinFor`, เปิด/ปิดใช้งานพร้อม guard owner คนสุดท้ายของ API)
  - PaginationBar: users เดิมอ่านครั้งเดียว (`usersQuery` ไม่มีแบ่งหน้า); roles ใช้ `rolesQuery` แบบ RolesPage (limit 50)
- REFACTOR: แยก `RoleCard` เป็น component ย่อยถ้าไฟล์เกิน ~200 บรรทัด

Files: create `src/features/users/components/TeamPage.tsx` (+ `RoleCard.tsx` ถ้าแยก).
Race risk: ชน Task 3 ถ้าแก้ไฟล์เดียวกัน — ให้ Task 3 สร้าง component เมนู/ติ๊กสิทธิ์เป็นไฟล์แยก
(`RolePermissionToggles.tsx`, `RoleCardMenu.tsx`) แล้ว TeamPage import ทีหลัง
Verify: `bun run typecheck` (ผ่านไฟล์ใหม่), `bun test ./src/features/users`

## Task 3 — ติ๊กสิทธิ์ inline + เมนู ⋯ บทบาท

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

- RED: test ของ `permission-groups` มีอยู่แล้ว — เขียน test เฉพาะ logic ใหม่ที่ pure (ถ้ามี); ส่วน mutation ผ่าน hook เดิม
- GREEN:
  - `RolePermissionToggles.tsx`: reuse `groupPermissions(PERMISSIONS)` + `t('roles:...')` keys เดิม,
    checkbox เรียก `useUpdateRole` (invalidate roles+me เดิม), owner เป็น read-only (pattern เดียวกับ RoleDialog)
  - `RoleCardMenu.tsx` (⋯): เปลี่ยนชื่อ → เปิด `RoleDialog` (มีอยู่แล้ว), ลบ → confirm dialog + กฎเดิม
    (systemKey หรือ userCount>0 ปิดปุ่ม), เพิ่มบทบาท (ปุ่มบนสุดของหน้า) → เปิด `RoleDialog` แบบสร้างใหม่
- REFACTOR: ไม่ duplicate กฎ disable ลบ — ถอดเป็น lib เล็ก ๆ พร้อม test ถ้าซ้ำเกิน 2 ที่

Files: create `src/features/roles/components/RolePermissionToggles.tsx`, `RoleCardMenu.tsx` (หรือฝั่ง users ตาม import rule — ตัดสินใจตอนทำ: permission UI อยู่ใน roles feature)
Race risk: ชน Task 2 ที่ไฟล์การ์ด — ตกลงกันว่า Task 2 เว้นช่อง (slot) ไว้ให้ import
Verify: `bun run typecheck`, `bun test ./src/features/roles`

## Task 4 — Shell: route/sidebar/i18n + ลบไฟล์เก่า + locale keys

Docs/config exception (no behavior logic of its own; verification = grep + typecheck + tests)

- `src/app/App.tsx`: route `/users` ชี้ TeamPage, ลบ route `/roles` + import RolesPage
- `src/app/AppSidebar.tsx`: ลบเมนู `/roles`, คงเมนู `/users` (guard เดิม)
- `src/app/i18n.ts`: ลบ `rolesLocales` ออกจาก namespace `roles`? — คงไว้ (RoleDialog/ติ๊กสิทธิ์ยังใช้ keys เดิม) ลบเฉพาะถ้าไม่มีใครใช้แล้ว (ตรวจด้วย grep)
- `src/features/users/index.ts`: export TeamPage; ลบ export UsersPage หลังย้าย route
- ลบไฟล์: `UsersPage.tsx`, `RolesPage.tsx` (หลังไม่มีใคร import แล้ว)
- เพิ่ม locale keys: ปุ่มเพิ่มผู้ใช้บนการ์ด, เมนูบทบาท, หัวข้อการ์ด (users/locales.ts + roles/locales.ts, th+en, `en satisfies typeof th`)

Files: files ข้างต้นเท่านั้น ห้ามแตะ api.ts ทั้งสองฝั่ง
Race risk: รอ Task 2–3 เสร็จก่อนลบไฟล์เก่า
Verify: `grep -r "RolesPage\|UsersPage" src` ต้องว่างเปล่า; `bun run typecheck`; `bun test ./src`

## Task 5 — Docs sweep + full verify

- grep `README.md`/`docs/summary.md`/`DESIGN.md` ว่ามีข้อความแยกหน้าผู้ใช้/บทบาทหรือไม่ — มีค่อยแก้ (living docs เท่านั้น ไม่แตะ dated specs/plans)
- `bun run typecheck`
- `bun run test` (API + web ทั้งชุด)
- `bun run screenshots` แล้วดูหน้ารวมที่ 390/768/1366px ด้วยตา (การ์ด + ติ๊กสิทธิ์ไม่ล้นจอ)
- e2e ถ้ามีเคส users/roles ต้องยังผ่าน (ระบุในผล)

Race risk: ไม่มี (ทำคนเดียวท้ายสุด)
Verify: ทุกคำสั่งข้างต้นเขียว + ไม่มี overflow ที่ 390px
