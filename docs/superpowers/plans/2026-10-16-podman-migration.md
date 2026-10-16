# Podman Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Docker with Podman as the only container engine for install, backup, restore, and development.

**Estimated tasks:** 6 (1 spike + 5) | **Estimated time:** ~2-4 days incl. live-machine proof | **Touches:** scripts (.sh/.ps1), package.json, docs, AGENTS.md

## Current Problem / Current Solution

Every container touchpoint shells to `docker compose`: `docker-compose.yml` (db/app/caddy + `https` profile), `docker-compose.dev.yml` (publishes 5433), six scripts (`install`, `backup`, `restore` x .sh/.ps1, ~30 call sites using `exec/cp/stop/start/logs/up`), `package.json` (`db:up`), and `docs/install.md`. e2e (`apps/web/e2e/run.ts`) and screenshots (`shots.ts`) create their `pos_e2e*` databases through the dev container on `localhost:5433`, so they ride on `db:up` with no code change. The `Dockerfile` (oven/bun, vite build, entrypoint LF fix) is Dockerfile-syntax and builds under `podman build` with no change expected.

## Proposed Approach

Keep the compose files byte-identical and swap only the engine: scripts call `podman compose` (Linux rootful via `sudo`, Windows via Podman Desktop with script-managed `podman machine`), docs and AGENTS.md follow, and existing shops migrate with the already-cross-engine backup format (`pg_dump` .sql.gz + media .tar.gz). A hardware spike (Task 0) proves `podman compose` accepts the current compose files on both OSes before any script is touched; if the spike finds a spec gap, the fallback is a minimal compose edit, not a rewrite.

## Side by Side

| Scenario | Before | After |
| --- | --- | --- |
| Fresh shop install (Linux) | `scripts/install.sh` requires `docker` + `docker compose` | requires `podman` (`sudo podman compose version` gates), same flags and output |
| Fresh shop install (Windows) | `install.ps1` requires Docker Desktop | requires Podman Desktop (winget-installable); script inits/starts `podman machine` when missing |
| Nightly backup cron / Task Scheduler | `docker compose exec/cp` | `podman compose exec/cp` (rootful on Linux so cron works unchanged) |
| Dev database | `bun run db:up` via `docker compose` | same command via `podman compose`; e2e/screenshots untouched |
| Existing docker shop | n/a | `backup.sh` on docker, fresh podman install, `restore.sh` on podman (same app version both sides) |
| Daily docs | `docs/install.md` + AGENTS.md say Docker | say Podman (+ machine/rootful notes + migration runbook) |

## Assumptions & Risks

- **Assumed:** Shop machines have network access at install time (Podman Desktop via winget on Windows; podman package on Linux).
- **Assumed:** The motive for the move is not rootless security (grill chose rootful `sudo` on Linux for ports 80/443).
- **Assumed:** `podman compose` (native, podman >= 5 / current Podman Desktop) supports everything the compose files use: `profiles`, `depends_on` with `service_healthy`, `CMD-SHELL` healthcheck, `${VAR:?}` / `:-` interpolation, `./Caddyfile` bind mount. Task 0 verifies; it is not taken on faith.
- **Risk:** Windows bind mount of `./Caddyfile` through the Podman machine fails or lands on the wrong path (project outside the shared drive). Task 0 must run from a real checkout, not a toy file.
- **Risk:** Cross-engine backup/restore fails if app versions differ (migrations run on boot, schema drift). Runbook pins: same app version both sides.
- **Risk:** `podman machine` init downloads a VM image (~1GB); offline shops cannot install. Documented as a requirement, no workaround in scope.

## Impact

- Shop installers follow a new prerequisite (Podman instead of Docker); install flags and outputs stay identical.
- Developers run `bun run db:up` unchanged (engine underneath changes).
- No application code, API contract, migration, or money/stock/QR logic is touched.
- `docs/install.md` and container sections of `AGENTS.md` are rewritten; a migration runbook is added.

---

## Task Overview

> **For implementation tasks:** Script edits are not unit-testable in this repo; each script task carries a docs/config-only exception with the smallest meaningful verification (parse check + live run) instead of RED -> GREEN. The spike and the acceptance task are live-machine proofs.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files.

1. **Spike: prove podman compose on both OSes** - Blocker | Can run together: none | Must wait for: none | TDD slice: docs/config-only exception (live-machine proof, checklist below)
2. **Linux scripts to podman (rootful)** - Lane A | Can run together: Task 3 | Must wait for: Task 0 | TDD slice: exception (parse check + live run)
3. **Windows scripts to podman (machine-managed)** - Lane B | Can run together: Task 2 | Must wait for: Task 0 | TDD slice: exception (parse check + live run)
4. **db:up to podman + e2e smoke** - Dev path | Can run together: none (one-line change, verify both OSes) | Must wait for: Task 1, Task 2 | TDD slice: exception (live `db:up` + e2e subset)
5. **Docs: install.md, AGENTS.md, migration runbook** - Docs | Can run together: none | Must wait for: Task 1, Task 2 (script flags/messages must be final) | TDD slice: n/a docs-only
6. **Acceptance: fresh installs + cross-engine migration** - Gate | Can run together: none | Must wait for: all above | TDD slice: exception (manual matrix, all green to merge)

---

### Task 0: Spike — prove `podman compose` runs the current stack on Linux and Windows

**Files:**

- Modify: none (spike only; record findings in the task report)
- Test: none (docs/config-only exception: nothing to unit-test; the proof IS the verification)

**Parallelization:**

- Can run with: `none` (blocker for everything)
- Must wait for: `none`
- Race risk: `none`

**Decision this task makes:** minimum engine floor (e.g. podman >= 5.x, Podman Desktop >= 1.x) and whether the compose files need any edit. If a spec gap appears, stop and report before Tasks 1-2 start.

- [ ] **Step 0: Load the TDD discipline**

  RED -> GREEN does not apply (no production code changes in this task). Verification is the live checklist below.

- [ ] **Step 1: Linux proof (rootful)**

  On a real Linux machine with podman installed, from a clean checkout with a test `.env` (own `COMPOSE_PROJECT_NAME`, never the live shop DB):
  `sudo podman compose -f docker-compose.yml up -d --build`, wait for `/api/v1/health`, then `sudo podman compose --profile https config` (do not need a real domain; `config` only must render). Exercise `exec -T`, `cp`, `stop/start`, `logs`.

- [ ] **Step 2: Windows proof (Podman Desktop)**

  On a real Windows machine from a checkout under the user's profile dir: `podman machine init` (if needed) + `start`, `podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d db`, connect to `localhost:5433`, then full `up -d --build` and hit `/api/v1/health`. Pay special attention to the `./Caddyfile` bind mount and `up --build` (vite build inside podman build).

- [ ] **Step 3: Report**

  Report: exact versions proven, any compose edit required (or "none"), Windows path caveats (shared-drive location, machine RAM default sufficiency for the vite build). If any checklist item fails, do not proceed to Tasks 1-2; propose the minimal compose edit first.

### Task 1: Linux scripts to podman (rootful)

**Files:**

- Modify: `scripts/install.sh`, `scripts/backup.sh`, `scripts/restore.sh`
- Test: none (exception below)

**Parallelization:**

- Can run with: `Task 2` (disjoint files)
- Must wait for: `Task 0` (engine floor + compose verdict)
- Race risk: `none` (no file overlap with Task 2)

- [ ] **Step 0: Load the TDD discipline**

  Exception: shell scripts have no unit harness in this repo. Verification is `bash -n` plus a live run on the Task-0 Linux machine.

- [ ] **Step 1: Rewrite the three scripts**

  Minimal swap: engine check becomes `command -v podman` + `sudo podman compose version`; every `docker compose` call becomes `sudo podman compose` (keep all flags, `-f` files, profiles, messages, exit codes identical). Update the header comments (`Docker Compose` -> `Podman Compose`). Do not restructure logic, do not add flags.

- [ ] **Step 2: Parse check**

  `bash -n scripts/install.sh && bash -n scripts/backup.sh && bash -n scripts/restore.sh` — must print nothing.

- [ ] **Step 3: Live run**

  On the Task-0 Linux machine with an isolated compose project: fresh `install.sh` to health-green, `backup.sh` producing both artifacts, `restore.sh --yes` round-trip (verify a canary row survives). Report the transcript.

### Task 2: Windows scripts to podman (machine-managed)

**Files:**

- Modify: `scripts/install.ps1`, `scripts/backup.ps1`, `scripts/restore.ps1`
- Test: none (exception below)

**Parallelization:**

- Can run with: `Task 1` (disjoint files)
- Must wait for: `Task 0` (Podman Desktop floor version + machine behavior)
- Race risk: `none` (no file overlap with Task 1)

- [ ] **Step 0: Load the TDD discipline**

  Exception: as Task 1. Verification is a parser check plus a live run on the Task-0 Windows machine.

- [ ] **Step 1: Rewrite the three scripts**

  Same minimal swap (`podman compose`, Podman Desktop wording). Additionally `install.ps1` gains, before anything else: (a) if `podman` missing, attempt `winget install --id RedHat.Podman -e` then re-check, else stop with the manual download link; (b) ensure a machine exists and is running (`podman machine list`, `init`/`start` as needed) and stop with a clear message if it cannot start. Keep install flags (`-Domain`), messages, and setup-code extraction identical.

- [ ] **Step 2: Parse check**

  Parse all three with the PowerShell parser (no execution), e.g. via `[System.Management.Automation.Language.Parser]::ParseFile(...)` — must return zero syntax errors.

- [ ] **Step 3: Live run**

  Same round-trip as Task 1 (install to health-green, backup both artifacts, restore round-trip with canary row) on the Task-0 Windows machine, starting from "no machine" state to prove the machine-management path. Report the transcript.

### Task 3: `db:up` to podman + e2e smoke

**Files:**

- Modify: `package.json:12` (`db:up` line only)
- Test: existing suites (no new tests; the dev DB path is exercised, not unit-testable)

**Parallelization:**

- Can run with: `none` (one line; verify on both OSes)
- Must wait for: `Task 1`, `Task 2` (engine behavior per OS must be settled)
- Race risk: `none`

- [ ] **Step 0: Load the TDD discipline**

  Exception: one-line command swap. Verification is live `db:up` on both OS machines.

- [ ] **Step 1: Swap the command**

  `db:up` becomes `podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d db` (Linux devs run rootless here: no `sudo`, ports are unprivileged; Windows devs use their running machine).

- [ ] **Step 2: Verify**

  On each OS: `bun run db:up`, connect to `localhost:5433`, run a fast e2e subset (`bun run e2e` full if time permits, else confirm `pos_e2e` creation path works). e2e/screenshots code is untouched.

### Task 4: Docs — install.md, AGENTS.md, migration runbook

**Files:**

- Modify: `docs/install.md`, `AGENTS.md` (container-command sections only: `db:up`, install/backup/restore, compose-file notes)
- Test: none (docs-only)

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 1`, `Task 2` (prerequisite text, exact commands, and machine behavior must be final)
- Race risk: `none`

- [ ] **Step 0: Load the TDD discipline**

  Docs-only: no RED -> GREEN. Verification is a reviewer read-through plus grep that no `docker` reference remains in the touched sections.

- [ ] **Step 1: Rewrite `docs/install.md`**

  Podman prerequisites per OS (Linux package + rootful note for 80/443; Windows Podman Desktop + machine auto-handling + checkout location caveat from Task 0), same install/backup/restore/update commands with `podman compose` in troubleshooting, and a new "ย้ายจาก Docker" runbook: backup on docker -> fresh podman install (same app version) -> restore -> verify -> decommission docker.

- [ ] **Step 2: Update `AGENTS.md`**

  Only the lines that name Docker/compose commands (`db:up`, install scripts, compose files). Do not touch architecture rules.

- [ ] **Step 3: Verify**

  `grep -rin docker docs/install.md AGENTS.md package.json scripts/` must show no engine references outside historical notes (if any are kept, they must be explicitly marked as history).

### Task 5: Acceptance — fresh installs plus cross-engine migration

**Files:**

- Modify: none (gate task; fixes go back into Tasks 1-4)
- Test: none (manual matrix)

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 1`–`Task 4`
- Race risk: `none`

- [ ] **Step 0: Load the TDD discipline**

  Exception: acceptance proof. All items below must be green before merge; any red sends work back to the owning task, no drive-by fixes here.

- [ ] **Step 1: Linux matrix**

  Fresh `install.sh` (http), fresh `install.sh --domain` (https profile renders and Caddy answers 80/443), backup/restore round-trip with images, update path (`backup.sh`, `git pull`, `up -d --build`).

- [ ] **Step 2: Windows matrix**

  Same round-trip via `.ps1` from no-machine state, plus cron/Task-Scheduler-shaped backup invocation (unattended `backup.ps1` with machine already running).

- [ ] **Step 3: Cross-engine migration**

  Seed a docker-stack shop (canary sale + product image), `backup.sh` on docker, tear down docker stack, fresh podman `install.sh` at the same commit, `restore.sh`, verify canary data + image URL loads. Then Task Scheduler/cron still fires.

- [ ] **Step 4: Sign-off**

  Report the full matrix transcript. Merge/push remains the owner's job (AI must not push).

---

## Amendment 1 (2026-10-16): decisions made after the Task 0 spike

The owner approved these changes before Tasks 1–2 started. They override the task text above where they conflict.

**Found by the spike on Windows (Podman 5.8.3, machine on WSL2, Docker Compose v5.6.0 standalone):**

1. Ports 80 and 443 cannot be bound by a rootless machine (`rootlessport cannot expose privileged port 80`). The Windows machine must be rootful (`podman machine set --rootful`, which needs the machine stopped).
2. Without `PODMAN_COMPOSE_PROVIDER`, `podman compose` falls back to the `docker-compose.exe` that Docker Desktop installs, so Docker Desktop is still needed. The provider must be a standalone Docker Compose binary (winget `Docker.DockerCompose`).
3. The compose client builds with the registry credentials in `~/.docker/config.json`. Docker Desktop stores them in its `desktop` credential helper, which returned `unauthorized` for `oven/bun:1` while a direct `podman pull` of the same image worked. A temporary empty `DOCKER_CONFIG` for the duration of the script avoids it. The user's Docker config is not changed.
4. A rootful machine has its own image storage, so base images are pulled again after switching from rootless.
5. Port 3000 may already be used on a developer machine. The spike ran on `PORT=3100`.

**Decisions:**

- **Task 2 (Windows scripts):** `install.ps1`, `backup.ps1` and `restore.ps1` all dot-source one shared helper, `scripts/podman-windows.ps1`, which: finds `podman.exe` (PATH, then `C:\Program Files\RedHat\Podman\podman.exe`; installs `RedHat.Podman` with winget if missing); creates the machine if none exists, starts it if stopped, and makes it rootful when it is not; sets `PODMAN_COMPOSE_PROVIDER` to a standalone Docker Compose (installs `Docker.DockerCompose` with winget if none is found outside Docker Desktop's folder); and sets `DOCKER_CONFIG` to an empty temporary folder for the process. Scheduled backups run the same helper, so they need no user-level setup.
- The helper sets environment variables for the current process only. It does not change the user's environment or Docker Desktop's settings.
- **Task 1 (Linux scripts):** unchanged apart from the swap. Scripts use `podman compose` through one `compose` function: `sudo podman compose` when not root, `podman compose` when already root (so a root crontab works). Linux is not verified yet: it needs a Linux machine (Task 0, Linux part), so only the parse check runs.
- **Not in scope of this amendment:** `package.json` (`db:up`, Task 3) and `docs/install.md` `[ยืนยันก่อนใช้]` markers (Task 4 follow-up) are untouched in this step.
- **Test limits:** the no-machine start path (Task 2 step 3) is tested only from a stopped machine. Removing the test machine to reproduce "no machine" would delete the spike's VM and images, so it is left for the owner to approve.
