# Windows Installer Implementation Plan

> Execute task-by-task with test-driven development. The owner approved the preceding design direction. No remote publication or live installation.

**Goal:** Build a reviewable Windows EXE that runs a prebuilt local TillumiPOS shop without a terminal.
**Architecture:** Inno Setup per-user shell, PowerShell 5.1 WinForms launcher, serial runtime worker and narrow elevated prerequisite/network helpers. Canonical compose remains the configuration source.
**Tech stack:** Inno Setup 6, PowerShell 5.1, Podman, Bun tests.
**Spec:** docs/superpowers/specs/2026-10-19-windows-installer-design.md

## Current problem / proposed approach

Users clone source, build on their till and manually troubleshoot ports. Ship a versioned app archive and Thai launch window. Keep the existing Podman architecture and isolate the packaged installation's data.

| Scenario | Before | After |
| --- | --- | --- |
| Install | Terminal and source build | EXE and guided prerequisites |
| Restart | Manually start machine | Resume at same user's sign-in |
| Upgrade | Rebuild in source folder | New setup + checked backup before migration |

## Constraints and risks

Windows 11 x64 only. Internet for WSL/Podman/dependency pulls. Setup code stays local and never in a shared URL. Do not touch current pos project, existing .env or databases. A new image may migrate schemas; never silently roll back. Full fresh-Windows/reboot/device proof is a release gate separate from build success.

## Task overview

Parallel-first: spawn a packaging worker for Task 2, while runtime work remains with the main agent. File ownership is disjoint; integration follows both lanes.

1. Runtime and control window — Can run together: Task 2; Must wait for: none; TDD slice: mocked first install/update failure tests -> worker and GUI -> targeted tests.
2. Packaging and artifact workflow — Can run together: Task 1; Must wait for: runtime interface below; TDD slice: payload/compose guard tests -> builder and Inno definition -> compile.
3. Integration and documentation — Can run together: none; Must wait for: 1 and 2; TDD slice: isolated project smoke -> fixes -> full required checks.

## Task 1: runtime

Files: installer/windows/{runtime,worker,launcher,network,enable-wsl}.ps1 and runtime.tests.ps1.
REQUIRED SUB-SKILL: test-driven-development.
- [ ] RED: tests for .env preservation, portable RNG, manifest tampering, update backup failure, version written only after health.
- [ ] GREEN: worker accepts -Action Start|Backup -ProgramDirectory and -ShopDirectory. Launcher accepts -AutoStart, defaults ProgramDirectory to its own folder and ShopDirectory to LOCALAPPDATA/TillumiPOS/shop. Payload lives at program/payload/{manifest.json,app-image.tar,docker-compose.yml,scripts/*}. Manifest fields: version (numeric x.y.z), image (localhost/tillumipos:x.y.z), sha256 (archive), composeSha256 (compose).
- [ ] GUI: background process, Thai status/error/retry/logs/open/backup, local-only setup code; WSL/reboot prompt; scoped LAN elevation.
- [ ] Verify: powershell -NoProfile -File installer/windows/runtime.tests.ps1; parse every new ps1.

## Task 2: packaging

Files: installer/windows/TillumiPOS.iss, scripts/build-windows-installer.ps1, .github/workflows/windows-installer.yml, packaging tests.
REQUIRED SUB-SKILL: test-driven-development (configuration-only compiler checks for Inno/YAML).
- [ ] Test compose conversion removes app build, adds prebuilt image and preserves all other configuration; reject invalid version/archive inputs.
- [ ] Builder accepts -Version x.y.z, -ImageArchive path, -OutputDirectory, -IsccPath. Generate staging in output; copy explicit allowlist only; create manifest hashes; compile installer. Prebuilt archive must contain localhost/tillumipos:x.y.z.
- [ ] Inno: default LOCALAPPDATA/TillumiPOS/program, PrivilegesRequired=lowest, x64 Windows 11, shortcuts/Run key; preserve sibling shop directory; close launcher/worker safely before replacement or abort; never erase data on uninstall.
- [ ] Workflow: manually dispatched version, build/save image on Linux with Podman, Windows package compile, upload artifact (never publish a release).

## Task 3: verification

- [ ] Compile real setup and inspect contents, execute safe isolated worker tests and image health smoke with disposable database/port/project only.
- [ ] Run bun run typecheck, bun run test and repo-secrets tests with disposable PostgreSQL, never current shop.
- [ ] Update docs/install.md and record evidence, release gaps, artifact path and recovery instructions. Review diff, commit via gitcz only. No push needed.
