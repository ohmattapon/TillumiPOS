# Windows installer verification and release handoff

Date: 2026-10-19. Worktree: `D:\worktrees\POS-windows-installer`; branch `ohmattpon/windows-installer`; base `origin/main` at `29485bb`. The original checkout and live/default Podman shop were not installed into, restarted or migrated by this work.

## Reviewable output

### Follow-up: autonomous provisioning in 0.1.2

The user correctly rejected a manual `podman machine init` rescue as proof of installer readiness. The original 0.1.1 failure's exact cause cannot be recovered from ENGINE_COMMAND_FAILED alone; no network/hardware cause is asserted as fact.

The runtime now retries only recognized transient network failures (at most3 init attempts), reads registration state after an unsuccessful init before deciding to retry, and resumes a registered machine without deletion/reinitialization. Permanent failures stop with phase-specific codes, native exit code, classified reason and bounded redacted bootstrap diagnostics. URLs and credential-bearing diagnostic lines are omitted; native app/compose output is never put in this log. The GUI explains the failure category in Thai.

Regression tests cover first-attempt network failure recovered by bootstrap, partial registration resumed without a second init, permanent failure not retried, bounded exhausted retries, and diagnostics redaction. The transient recovery case was observed failing before implementation, then passed under Windows PowerShell5.1. A separate real-worker test also verifies that a permanent init failure reaches JSON as ENGINE_INIT_FAILED with PERMISSION reason, rather than losing the cause during a rethrow.

An opt-in `bootstrap.tests.ps1` now uses the actual packaged worker in Windows PowerShell5.1 with a new machine name and separate shop/port. Unlike the old smoke, it does not replace Initialize-InstallerEngine and does not pre-create/start a VM. Native engine-only provisioning passed with `tillumipos-boot-test-67ce7bde`; the packaged full worker passed with `tillumipos-boot-test-d31313a8`: VALIDATING11:22:56, STARTING_ENGINE11:22:58, LOADING_IMAGE11:23:21, STARTING_SHOP11:24:01, READY11:24:19, STOPPED11:24:24. It created the VM, loaded the bundled app, started database/Redis/app, served first-run HTTP and stopped through its own Stop worker. Setup codes remained in captured memory, not logs. This proves provisioning on this host with WSL/Podman already installed, not pristine Windows prerequisite installation.

The final staged runtime (including redacted diagnostics) was tested again with another absent machine, `tillumipos-boot-test-d7d39922`, through the same packaged Start/Stop workers; all steps passed. Compiler exit0, PowerShell parser, runtime/packaging tests passed. Final trial output: `dist-installer/ready/TillumiPOS-Setup-0.1.2.exe`; SHA256 `9F4BEA89E34F125A8580740A824D174BCDBDE1A961D95B225116095931CC3208`. The original Windows-clean-install/code-signing release gates remain open. Application TypeScript/API code did not change in this patch; the historical full-suite evidence below is retained, not represented as a new full-suite run.

### Follow-up: existing LAN forwarding blocked first start

The first actual user launch of 0.1.0 stopped at PORT_IN_USE. Windows had only IP Helper listening on `192.168.1.34:3000` for an existing netsh forward to `127.0.0.1:3000`; no app listened on localhost. The initial preflight treated this reusable forwarding rule as a competing app.

The 0.1.1 runtime accepts only listener addresses backed by the existing shared parser's same-port IPv4-to-localhost forwarding rules. Real localhost/wildcard listeners, unknown LAN listeners, and a proxy alongside a real localhost listener still block installation. No rule or running app was removed. Regression failed against 0.1.0 and passed after the fix, including a read-only check against this machine's actual existing rule. Runtime/packaging tests and PowerShell parsing passed. App source and API contract are unchanged; the app image is retagged for the patch installer version.

The 0.1.0 build and full application-suite results below remain historical validation for the initial candidate; use the 0.1.1 installer for this port-forwarding fix.

### Original 0.1.0 candidate

- Trial installer: `dist-installer/ready/TillumiPOS-Setup-0.1.0.exe`, 275529602 bytes.
- SHA256: `D6EF7CF26BC71F6E224E7C7736CBC77ECF9CFEDFB9717C503A4B7298C495BA01` (also in the adjacent `.sha256` file).
- Unsigned (`Get-AuthenticodeSignature`: NotSigned). This is a local candidate, not a published release.
- Built by portable Inno Setup 6.5.4; actual app image built from mainline app source with Podman on Linux amd64. All five staged runtime scripts matched source SHA256 after compilation.
- Operator guide: `docs/windows-installer.md`. Default installation creates a separate shop; migrating the current script-installed shop is explicitly a backup/restore task.

## Completed checks

- Windows PowerShell 5.1 runtime tests: settings preservation; cryptographic RNG; invalid/tampered payloads; backup failure; health failure; update order; idempotent start; pending migration downgrade and same-version identity; dedicated engine and inherited host isolation; uninstall before first run.
- Packaging tests: exact compose preservation except app image, archive tag/platform rejection, explicit allowlisted staging and hashes. PowerShell parser and both workflow YAML checks passed.
- Real EXE compiler exited 0 (48.516 seconds). Installer execution, registry/shortcut behavior and uninstall execution on a fresh Windows account are separate release gates below.
- Real app smoke in a separate test machine: start on port13070, HTTP health, setup code returned only in memory, canary SQL and media backup, restart with byte-identical `.env`, checked update orchestration preserving the canary. The update uses the same app build with older installed-version metadata, so this does not prove an upgrade across different schemas. Test compose volumes were removed after each smoke.
- `bun run typecheck` passed on Windows. `bun run test:web` passed: 493 tests, 0 failures. Repository secrets test passed against the staged real checkout (5 tests).
- Final `bun run test` passed (exit0) in the isolated Linux source fixture: API1836 pass, 11 platform skips, 0 failures across165 files (215.91s); web493 pass, 0 failures across72 files. Native installer/runtime/packaging and PowerShell parser tests passed on Windows separately.
- `bun run openapi:check` passed: v1 and v2 match their existing baselines; no contract was regenerated.

## Test environment notes

Native Windows full-suite attempts hit existing Unix-shell/psql test dependencies. An isolated Linux run passed application tests but initially lacked Git for repository tests. The complete source was then copied to a disposable Git fixture with Git and PostgreSQL client installed. A cafe migration cleanup timed out while waiting for a disk checkpoint; its two assertions had completed. No source tests were weakened. The final test database uses tmpfs, fsync off and synchronous_commit off strictly for disposable test speed; these settings were never applied to the shop or the installer compose file. Windows-specific PowerShell tests are executed separately on Windows rather than inferred from Linux skips.

## Release gates still requiring another environment

- Fresh Windows11 x64 without WSL, winget/Podman/Compose; missing virtualization; interrupted download and disk full.
- Actual reboot/resume and same-account sign-in startup. UAC using another administrator's credentials.
- Actual installer/uninstaller on a disposable Windows account, including cancel uninstall, busy backup, reinstall and data preservation.
- Real second-device access and DHCP changes on the shop router; a local HTTP probe does not prove firewall/client isolation behavior.
- Upgrade between real released versions with schema changes, and verified restore of paired SQL/media backups.
- Trusted code-signing certificate and distribution channel. The manual artifact workflow is implemented and parsed, but no GitHub workflow/release/push was run in this task.

## Recovery boundaries

Do not force a lower version after a failed startup: the database may already have migrated. Preserve `.env`, pending-version.json, previous compose and backups. Support must select connection `tillumipos-root`, compose project `tillumipos` and the persistent shop directory explicitly. The launcher contains a checked backup button; restore remains an explicit confirmed administrator/support operation.

References consulted for implementation: [Inno per-user privileges](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm), [uninstall abort phases](https://jrsoftware.org/ishelp/topic_isxfunc_abort.htm), [WSL prerequisites/restart](https://learn.microsoft.com/en-us/windows/wsl/install), [Podman image archives](https://docs.podman.io/en/stable/markdown/podman-save.1.html).
