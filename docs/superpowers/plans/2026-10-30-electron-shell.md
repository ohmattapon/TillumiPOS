# Electron Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** An Electron window around the existing local service: kiosk window, silent receipt printing, a waiting page while the service starts, and an installer shortcut that opens it (falling back to the browser).

**Architecture:** `apps/desktop/` is a Bun workspace with a TypeScript main process and preload. Decision logic (which origin may load, which navigations stay inside, wait-page backoff, printer choice) is pure functions with `bun test` files next to them; `main.ts` only wires Electron to them. The web app uses `window.tillumiDesktop` when present and falls back to `window.print()`. electron-builder produces an unpacked `dir`, which `installer/tillumi.iss` copies; the shortcut tries the app first, then Chrome kiosk, Edge kiosk, the plain browser.

**Tech Stack:** Electron (pin the newest stable full version at implementation time and record it in the report), electron-builder (`dir` target), TypeScript, Bun test, Inno Setup 6 (existing).

**Spec:** `docs/superpowers/specs/2026-10-30-electron-shell-design.md`

## Outcome (2026-10-31)

Tasks 1, 2, 4 and 5 are implemented; Task 3 was dropped, so printing stays on the existing server-side LAN printer path. `bun test ./apps/desktop` = 231 pass and `bun run typecheck` exits 0. Still open: a real install into a throwaway machine, the visual checks (kiosk, window mode, owner menu, customer-display popup), the release workflow `windows-installer.yml` (it builds the Podman installer `installer/windows/TillumiPOS.iss`, not this branch's `installer/tillumi.iss`, and passes no `/DDesktopDir`), and commit `5ab5ef9` has no `Co-Authored-By` trailer.

## Global Constraints

- The app window loads only the shop origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`, port from `TILLUMI_SHOP_URL`, default `http://127.0.0.1:3000`); any other URL opens in the system browser, never inside the app window.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` left on; preload exposes only `printReceipt` and `listPrinters` and checks the caller's origin on every call.
- No secret, setup code, password or token in the app, its config files, or the launch arguments (do not touch the setup-code rules in AGENTS.md).
- No change to API behavior, `server/test/openapi-baseline.json`, the database, or the existing update path (`apply-update.ps1`).
- The web must keep working in a plain browser: every use of `window.tillumiDesktop` is optional chaining with a fallback.
- The only new dependencies are `electron` and `electron-builder` as devDependencies of `apps/desktop` (workspace); pin exact versions; nothing added to the web or API packages.
- Windows 10/11 x64 only; code signing is not part of this plan but the build must accept signing through environment variables without code changes (`CSC_LINK`, `CSC_KEY_PASSWORD` are read by electron-builder; do not add them anywhere in the repo).
- All user-visible text in the app comes from one small `strings.ts` (Thai, with English keys) — the app has no i18n framework.
- Commit only with `gitcz` (`feat`, `test`, `docs`, `ci`, `chore`; never `build`), trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, one concern per commit; before saying done `bun run typecheck` and `bun run test` pass.

## Review Focus

1. A page that tries to navigate the window to another origin (link, `window.open`, redirect, `javascript:` or `data:` URL) must never load inside the app (Task 1 tests the decision function over a table of hostile URLs, including `127.0.0.1.evil.com`, userinfo tricks and uppercase hosts).
2. The preload API must refuse calls from any frame whose origin is not the shop origin, including child iframes (Task 2).
3. Launching the app twice must focus the first window and not start a second instance or a second kiosk (Task 2).
4. If the service is down for a long time the waiting page keeps retrying gently and never shows a raw browser error page (Task 1 tests the backoff sequence is bounded; Task 2 smoke).
5. If the app files are missing or fail to start, the installer shortcut still opens the shop through the browser fallback (Task 5 installer test).

---

### Task 1: Pure decision logic

**Deviation:** `printers.ts` was never built (the print surface was dropped in Task 3). `shop-origin.ts`, `backoff.ts` and `strings.ts` were built as planned; window mode later added `window-mode.ts`, `window-state-file.ts`, `window-options.ts`, `debounce.ts`, `owner-menu-items.ts` and `render-gone.ts` beside them.

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/src/shop-origin.ts`, `apps/desktop/src/shop-origin.test.ts`, `apps/desktop/src/backoff.ts`, `apps/desktop/src/backoff.test.ts`, `apps/desktop/src/printers.ts`, `apps/desktop/src/printers.test.ts`, `apps/desktop/src/strings.ts`
- Modify: root `package.json` (workspaces add `apps/desktop`; `typecheck` script add the desktop tsconfig), `bun.lock`

**Interfaces:**
- Produces: `parseShopOrigin(raw: string | undefined): string` (returns the normalized origin; throws on anything that is not `http://127.0.0.1:<port>` or `http://localhost:<port>`; default `http://127.0.0.1:3000`); `isShopUrl(shopOrigin: string, url: string): boolean` (true only for the exact origin; false for malformed URLs); `navigationDecision(shopOrigin: string, url: string): 'allow' | 'external' | 'deny'` (allow = same origin; external = `http:`/`https:` elsewhere, to open in the system browser; deny = every other scheme such as `javascript:`, `data:`, `file:`, `blob:`); `nextDelayMs(attempt: number): number` (1 s growing to a 10 s cap, never above the cap, never below 1 s); `choosePrinter(saved: string | null, available: { name: string; isDefault: boolean }[]): string | null` (the saved name if it is still available, else the default one, else the first, else null).

- [x] **Step 1: Write failing tests** with the exact cases of Review Focus 1: `isShopUrl`/`navigationDecision` over a table including `http://127.0.0.1:3000/`, `http://localhost:3000/x`, `http://127.0.0.1.evil.com:3000/`, `http://127.0.0.1:3000@evil.com/`, `http://evil.com@127.0.0.1:3000/` (judge by the parsed origin, not by string prefix), `HTTP://LOCALHOST:3000`, `http://127.0.0.1:3001/` (other port), `javascript:alert(1)`, `data:text/html,x`, `file:///c:/x`, `blob:http://127.0.0.1:3000/x`, `about:blank`, empty and malformed strings; `parseShopOrigin` accepts the two forms and rejects `https://…`, other hosts, a path or query, missing port; `nextDelayMs(0)=1000`, monotonic non-decreasing, `nextDelayMs(1000)=10000`; `choosePrinter` four cases.
- [x] **Step 2: Run** `bun test ./apps/desktop` → FAIL (modules missing).
- [x] **Step 3: Implement** the four functions in the files above using `new URL` and comparing `origin`; `strings.ts` exports the Thai texts for the waiting page and the owner menu.
- [x] **Step 4: Run** the tests → PASS; run `bunx tsc -p apps/desktop --noEmit`.
- [x] **Step 5: Commit** `feat(desktop): add the desktop shell decision logic`.

### Task 2: Main process, preload and waiting page

**Deviation:** `ipc.ts` and `settings.ts` were removed once the print surface was dropped, so the preload exposes only a minimal surface. The smoke was done with processes and sockets (no visual check): `task-4-report.md`.

**Files:**
- Create: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/window.ts`, `apps/desktop/src/wait-page.html`, `apps/desktop/src/ipc.ts`, `apps/desktop/src/ipc.test.ts`, `apps/desktop/src/settings.ts`, `apps/desktop/src/settings.test.ts`
- Modify: `apps/desktop/package.json` (`main`, `electron` devDependency pinned, scripts `dev`, `start`)

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `isTrustedSender(shopOrigin: string, frameUrl: string, isMainFrame: boolean): boolean` (true only for the main frame whose URL is the shop origin) in `ipc.ts`; `loadSettings(dir: string): { printer: string | null }` and `saveSettings(dir: string, s): void` in `settings.ts` (JSON file under the Windows per-user app data folder; stores only the printer name; tolerates a missing or corrupt file by returning defaults); `window.tillumiDesktop: { printReceipt(html: string): Promise<{ ok: boolean; reason?: string }>; listPrinters(): Promise<{ name: string; isDefault: boolean }[]> }` exposed by the preload; `shopWindow` behavior: fullscreen/kiosk, no menu bar, `will-navigate` and `setWindowOpenHandler` routed through `navigationDecision` (external → `shell.openExternal`, deny → nothing), `app.requestSingleInstanceLock()` with focus of the first window on the second launch, a hidden owner menu on `Ctrl+Shift+Alt+O` offering: leave full screen, choose printer, quit; the wait page is loaded while `GET <origin>/api/v1/health` fails, retrying with `nextDelayMs`, then navigates to the shop.

- [x] **Step 1: Failing tests**: `isTrustedSender` — shop main frame true; shop child iframe false; other-origin main frame false; malformed false. `settings` — round trip; missing file → defaults; corrupt JSON → defaults; the file never contains anything but `printer`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement** `ipc.ts`/`settings.ts` first, then `window.ts`, `preload.ts`, `main.ts`, `wait-page.html` (static, no script that loads a remote resource; shows the Thai "กำลังเปิดระบบร้าน" text and a retry hint; the retry loop lives in main, not the page). `printReceipt` renders the given HTML in a hidden window with `sandbox: true` and prints it with `webContents.print({ silent: true, deviceName })` using `choosePrinter`; if no printer is available it returns `{ ok: false, reason: 'no-printer' }` and does not throw.
- [x] **Step 4: Run** tests → PASS; `bunx tsc -p apps/desktop --noEmit`.
- [x] **Step 5: Smoke by hand**: run the repo's API (`bun run dev:api` against a throwaway database as described in `docs/install.md`; never the live database), then `bun run --cwd apps/desktop start`; confirm the shop loads, an external link opens in the browser, a second launch only focuses the first, stopping the API shows the wait page and restarting it recovers. Record what you saw in the report.
- [x] **Step 6: Commit** `feat(desktop): add the shop window, preload and waiting page`.

### Task 3: Web integration — DROPPED

**Decision (2026-10-30):** printing stays on the existing server-side LAN receipt-printer path, so the shell exposes no print surface and the web is untouched (commits `1aeedd9`, `6036b91`, `4db3a70`). The steps below were not done and are kept only as the record of the original design.

**Files:**
- Create: `src/lib/desktop.ts`, `src/lib/desktop.test.ts`
- Modify: the file(s) that print receipts (find with `grep -rn "window.print" src`), `src/vite-env.d.ts` or the repo's global types file

**Interfaces:**
- Produces: `getDesktop(): TillumiDesktop | null` and `printReceiptHtml(html: string, deps?: { desktop: TillumiDesktop | null; fallback: () => void }): Promise<void>` in `src/lib/desktop.ts` — uses `desktop.printReceipt` when present and ok, otherwise calls the fallback (`window.print`); never throws.

- [ ] **Step 1: Failing tests**: with a fake desktop returning ok the fallback is not called; with `{ ok: false }` the fallback is called once; with a rejecting desktop the fallback is called once and nothing throws; with no desktop the fallback is called.
- [ ] **Step 2: Run** `bun test src/lib` → FAIL. **Step 3: Implement** and switch the existing print call sites to `printReceiptHtml` without changing what they print. **Step 4: Run** tests and `bun run typecheck` → PASS (all user-visible text unchanged; no new string needs i18n).
- [ ] **Step 5: Commit** `feat(web): print through the desktop shell when it is there`.

### Task 4: Packaging

**Deviation:** one cross-shell Bun script `apps/desktop/build.ts` (plus `before-build.cjs`) replaced `scripts/build-desktop.ps1` and `.sh`, so there is one implementation for Windows and Linux.

**Files:**
- Create: `apps/desktop/electron-builder.json`, `scripts/build-desktop.ps1`, `scripts/build-desktop.sh`
- Modify: root `package.json` (scripts `desktop:build`, `desktop:start`), `.gitignore` (`apps/desktop/dist/`, `apps/desktop/release/`)

**Interfaces:**
- Produces: `bun run desktop:build` → `apps/desktop/release/win-unpacked/` containing `TillumiPOS.exe`; the config uses target `dir`, `asar: true`, `files` limited to the compiled output, `artifactName` without spaces, `win.target: dir` x64, no auto-update, no installer; reads signing from environment only.

- [x] **Step 1:** write the config and scripts (the script compiles TypeScript to `apps/desktop/dist` with `bun build` or `tsc` — pick the one that works with Electron's Node, record why — then runs electron-builder). **Step 2:** run `bun run desktop:build` on this machine; confirm `TillumiPOS.exe` starts (`--version` or open-and-close smoke) and the unpacked size is reported. **Step 3:** a test (`apps/desktop/src/package-config.test.ts`) that reads `electron-builder.json` and asserts target `dir`, `asar` true, no `publish`, no `nsis`, no secrets-looking keys. **Step 4: Commit** `chore(desktop): package the shell with electron-builder`.

### Task 5: Installer, shortcut, CI and docs

**Files:**
- Modify: `installer/tillumi.iss`, `installer/tests/regressions.ps1` (or the file where the installer text is regression-tested), `.github/workflows/ci.yml` (only if the installer job needs the new check), `docs/windows-native-installer.md`, `AGENTS.md`

**Interfaces:**
- Consumes: Task 4 `release/win-unpacked/`.
- Produces: the installer copies the unpacked app to `{app}\desktop\` when `DesktopDir` (a new `/D` define, like `PayloadDir`) is given and points at an existing folder; the "เปิดหน้าร้าน" shortcuts (desktop and Start menu) target `{app}\desktop\TillumiPOS.exe` with `TILLUMI_SHOP_URL` not passed on the command line (the app reads its default; the port is a compile-time constant in the installer so the shortcut passes `--shop-url` only if the port differs from 3000 — handle this with the existing `{#ShopUrl}` define via an argument the app parses with `parseShopOrigin`); a `Check: HaveDesktopApp` guard falls back to the existing Chrome/Edge/plain-browser entries when the folder is absent, so an installer built without `DesktopDir` behaves exactly as today; the post-install "open the shop now" entry uses the same choice.

- [x] **Step 1: Failing installer test** (pattern of the existing installer regression tests): the `.iss` text contains the `DesktopDir` define, the `HaveDesktopApp` check, and the fallback entries unchanged; an installer compiled without `DesktopDir` has no `desktop` file entry (assert on the text, as the existing tests do).
- [x] **Step 2: Run** the installer test script as `ci.yml` does → FAIL. **Step 3: Implement** the `.iss` changes and update the header build procedure with the new step ("build the desktop shell with `bun run desktop:build` and pass `/DDesktopDir=…`"). **Step 4:** update `docs/windows-native-installer.md` (what changes for the shop: the shortcut opens the app window; how to open the owner menu; silent printing and how to choose the printer; the browser still works for iPad; what to do if the app does not open) and add the AGENTS.md lines (`apps/desktop/` in Project structure, the commands, and one rule: the desktop shell loads only the shop origin and holds no secrets). **Step 5:** run `bun run typecheck`, `bun run test`, `bun run lint`, `bun test ./server/src/__tests__/repo-secrets.test.ts` → PASS. **Step 6: Commits** (one per concern) `feat(installer): open the shop in the desktop shell`, `docs(desktop): document the desktop shell`.
- [ ] **Step 7: Full check by hand** — the compile half is done with a portable Inno Setup 6.7.3: a build with `/DDesktopDir` (113 MB setup) and one without (2 MB) both exit 0, and the three bad-`DesktopDir` cases abort with exit 2 (`.superpowers/sdd/2026-10-30-electron-shell/task-installer-compile.md`). Still open: a real install into a throwaway machine, because it needs elevation and would install the services.
