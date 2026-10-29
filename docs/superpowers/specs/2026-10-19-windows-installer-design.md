# Windows shop installer

Approved direction: the owner requested a Windows EXE installer after reviewing the local-shop/Podman approach. This document makes that approval concrete; no further product decisions are required to implement it.

## User experience

Windows 11 x64, one signed-in Windows account on the main till. A per-user Inno Setup EXE installs a Thai control window and shortcuts. The window starts the shop, opens its browser, displays the setup code locally, offers backup, retry, and a diagnostic log. Startup resumes when that same user signs in; there is no claim of running before sign-in. A missing WSL installation prompts for elevation and explains the required reboot; setup resumes from the installed shortcut/startup entry. Internet is required for prerequisites and first pulls.

## Distribution and identity

Bundle an already built Linux amd64 app image archive, its SHA256 and version/image manifest, a production docker-compose.yml derived from the canonical compose file (replace app build with image), and the shared Podman/LAN scripts. Checked database/media backups live in the installed runtime; the source-only backup/restore scripts are not shipped with incorrect working directories. End users never compile source. Install program files under LOCALAPPDATA/TillumiPOS/program; persistent .env, active docker-compose.yml, logs, backups and installed-version.json live under LOCALAPPDATA/TillumiPOS/shop. Fixed compose project tillumipos isolates this installation from developer/live pos projects. Never adopt an existing development database automatically. A busy configured port aborts a first installation.

Podman remains in the original user's context, with a dedicated rootful machine named `tillumipos` and connection `tillumipos-root`. Never stop or reconfigure other machines. Only WSL enablement and LAN repair helpers elevate. The installer itself uses lowest privileges; starting it elevated is rejected by the launcher rather than silently creating a second account's shop. The user explicitly confirms that the current network belongs to their shop before changing Public to Private. LAN repair is repeated on launch for the previously trusted Private/Domain network to refresh a DHCP address, with elevation only when needed. Firewall stays Private/Domain and LocalSubnet.

## Start, update, failure

A file lock serializes start/update/backup across windows. Validate the manifest and archive before loading. Preserve existing .env byte-for-byte. First install generates secrets using RandomNumberGenerator compatible with Windows PowerShell 5.1. Load app image, pull dependency images if missing, start using docker-compose.yml only and --no-build, then poll health with bounded timeouts. Write installed version only on health success. Never print environment contents or secret connection URLs to diagnostic logs.

Running a newer setup replaces only program payload; the next start compares the packaged manifest with installed version. Before replacing the active compose file or starting new migrations, stop app traffic and make checked database and media backups. A backup failure aborts the update. On failed migrations/start keep the backup and previous compose; show a recoverable error and never auto-restore or downgrade the database. Restore is explicit and retains the existing confirmation requirement. No automatic remote publishing, in-app self-downloads or unattended schema rollback.

Uninstall removes program files and startup shortcut only. Preserve .env, backups, Podman machine and volumes. Do not remove shared prerequisite programs or network rules automatically.

## Boundaries and proof

No API/schema changes; existing scripts remain supported. Build locally and in a manually dispatched CI workflow as downloadable artifacts, without GitHub releases or pushes. The build excludes .env, .wrangler, logs and databases. Tests exercise secret generation, payload validation, idempotent startup, failed backups/health, and preserving existing settings via mock commands, plus PowerShell parser and compiler checks. Run isolated container tests with a separate compose project and environment. Clean-machine WSL/reboot, UAC under another admin account, DHCP change, actual second-device access, and signed installer trust need separate Windows/device proof; do not claim these from a successful build.
