# One package at the root, like the team's projects

Date: 2026-10-17
Branch: `ohmattpon/single-package-layout`

## Why

The project owner wants POS to look professional and to follow the same layout as the rest of their team. The reference is `D:\KPRU-CWIE` and its `template_structure.md`. Someone from the team should open the repo and find things where they expect them:

- one `package.json` at the root, not a workspace of sub-packages
- the API in `server/src/`
- the web and the tooling (`e2e/`, `drizzle/`, configs, `Dockerfile`s) at the root

Today POS is a Bun workspace (`apps/api`, `apps/web`, `apps/media`), each with its own `package.json`.

## Goals

- One `package.json` at the root holds every dependency and script of the API and the web.
- The API moves from `apps/api/` to `server/`. Its insides (`src/`, `test/`, `scripts/`) keep their structure.
- The web moves from `apps/web/` to the root: `src/`, `public/`, `index.html`, `vite.config.ts`, `components.json`, and the tsconfig files. The owner chose this, the standard Vite layout, over copying the team's Next.js folder names.
- Repo-level tooling lives at the root, as in the team template:
  - browser tests: `apps/web/e2e/` → `e2e/`
  - migrations: `apps/api/drizzle/` → `drizzle/`
  - Drizzle config: `apps/api/drizzle.config.ts` → `drizzle.config.ts`
- The image Worker moves from `apps/media/` to `workers/media/`. The Cloudflare container Worker from `ohmattpon/cloudflare-containers` (`apps/cloud`) moves to `workers/cloud/`. It lands on `main` before this work (see Sequencing).
- Every command in AGENTS.md's "Common commands" keeps its name and its effect (`bun run dev`, `test`, `test:unit`, `typecheck`, `lint`, `e2e`, `screenshots`, `db:*`, `hooks:install`), and so do the CI and the hooks.
- The web keeps importing the API's shared code as `@pos/api/...`, now as a path alias instead of a workspace package, so none of the 60 importing files change.

## Non-goals

- **No move to Next.js.** The web stays Vite + React. Next.js would rewrite routing and add an API proxy, which is a separate project.
- **No change to the test runner.** Tests keep using `bun test`. The team uses Vitest, but switching would touch every test file for no gain in layout.
- **No split into `Dockerfile.server` and `Dockerfile.web`.** The install kit ships one image in which the API serves the built web (`WEB_DIST`, `web.plugin.ts`). `docker-compose.yml`, Caddy and the `scripts/install|backup|restore` scripts all assume that image. Splitting it would change how shops install and update. The single `Dockerfile` stays (the team repo also has a root `Dockerfile`). (My call.)
- **No change to code behavior, the API contract or the database.** The OpenAPI baselines must stay byte-identical. Migrations move as files, and the migration journal and history do not change.
- **No renaming inside the API or the web.** `@pos/api` keeps its name, as an alias.

## Anti-goals

- A shop that runs `scripts/install.sh` or updates with `docker compose` gets a broken image or loses data: wrong `WEB_DIST`, a migrations folder that is not found, or the `pos-media` volume path changed.
- A command in AGENTS.md or README stops working, or silently does less: for example, `bun run test` no longer running the web tests, or `typecheck` skipping a part.
- History is lost: files must be moved with `git mv` so that `git log --follow` and blame keep working.
- A secret leaks: `repo-secrets.test.ts` and `scripts/check-secret-files.ts` must still find a `.env` anywhere in the new layout.

## Target layout

```text
POS/
├── server/                 was apps/api (minus drizzle/ and drizzle.config.ts)
│   ├── src/                unchanged inside
│   ├── test/               harness, fake SCB, OpenAPI baselines
│   ├── scripts/            scb-inquiry.ts
│   ├── tsconfig.json       Bun types, decorators (was apps/api/tsconfig.json)
│   ├── bunfig.toml         [test] preload = ./test/setup.ts, env = false
│   └── .env.test
├── src/                    was apps/web/src, unchanged inside
├── public/                 was apps/web/public
├── e2e/                    was apps/web/e2e (run.ts, shots.ts)
├── drizzle/                was apps/api/drizzle (SQL + meta/)
├── workers/
│   ├── media/              was apps/media, keeps its own package.json (see below)
│   └── cloud/              was apps/cloud (from cloudflare-containers), same treatment
├── docker/  docs/  scripts/
├── index.html  vite.config.ts  components.json
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json
├── drizzle.config.ts
├── package.json            the one package: all deps and scripts of API and web
├── bun.lock  bunfig.toml  lefthook.yml
├── Dockerfile  docker-compose.yml  docker-compose.dev.yml  Caddyfile
└── AGENTS.md  DESIGN.md  README.md  LICENSE
```

### The one exception: `workers/*`

The Cloudflare Worker is built and deployed by `wrangler`, which reads its own `wrangler.jsonc` and type-checks against `worker-configuration.d.ts`. Its compiler settings differ from both the API and the web. It stays a small package of its own, in the root's `"workspaces": ["workers/*"]`. The same holds for `workers/cloud`. Its container is built from the root `Dockerfile`, so its path to that file must follow the move. Everything the team template describes (web + server) is in the one root package. (My call: putting `wrangler` and Worker types into the root package would mix three runtimes into one tsconfig.)

## How the pieces fit

### Package and scripts

- The root `package.json` merges the `dependencies` and `devDependencies` of `apps/api` and `apps/web`, and drops `@pos/api: workspace:*`. When the two packages pin different versions of the same package, keep the higher one, and say so in the commit body. `bun.lock` is regenerated with `bun install`, and the diff must show no version changes other than those merges.
- Scripts run from the root and point at paths, not at `--filter`:
  - `dev` runs the API (`bun --env-file=.env --watch server/src/index.ts`), Vite and the Worker in parallel.
  - `test` runs the API tests, then the web tests.
  - `test:unit` runs the API unit tests.
  - `typecheck` runs `tsc -b` for the web, `tsc -p server` and the Worker's typecheck.
  - `lint` runs oxlint on `src`.
  - `openapi:check`, `db:*`, `e2e`, `screenshots` and `scb:inquiry` keep their names.
  - Environment files: `--env-file=../../.env` becomes `--env-file=.env`, since scripts now run from the root.
- **API tests run with `server/` as the working directory** (`cd server && bun --env-file=.env.test test`), so Bun picks up `server/bunfig.toml` and its `preload`. The preload sets up the fake media server and must not run for the web tests. The web tests run from the root with `bun test ./src` (a bare `src` is a path filter that would also match `server/src`). (My call.)

### TypeScript

- The root `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` are the web's, moved up. `paths` gains `"@pos/api/*"` entries that map each former export of `@pos/api` to its file under `server/src/`:
  - `.`, `types`, `pricing`, `shop-settings`, `modifiers`, `promotions`, `dining-table`, `permissions`
  - `@/*` stays `./src/*`
- `vite.config.ts` gets the same `@pos/api` aliases in `resolve.alias`, and `envDir` becomes `.`
- `server/tsconfig.json` is the API's current one, unchanged, plus `"include": ["src", "test", "scripts"]`, so the root's web files are not type-checked with Bun's settings.

### Build, install and deploy

- `Dockerfile`:
  - copies the root `package.json` and `workers/media/package.json`
  - builds the web with `bunx vite build` at the root
  - sets `WEB_DIST=/repo/dist`
- `docker/entrypoint.sh` runs from `/repo/server`. The migrator must still find `drizzle/` (see below).
- **Migrations folder:** the migrator (`server/src/infrastructure/database/migrate.ts`), the test harness (`server/test/harness.ts`, which also calls `migrate`) and `drizzle.config.ts` must point at the root `drizzle/`. Resolve it from the source file (`new URL('../../../../drizzle', import.meta.url)`), not from the working directory, so it works from the root, from `server/` and in Docker.
- `.github/workflows/ci.yml`, `lefthook.yml`, `scripts/check-secret-files.ts` (+ test), `server/src/__tests__/repo-secrets.test.ts` (its `root` is now three levels up), `e2e/run.ts` and `e2e/shots.ts` (`cwd` for the API is `server`, for Vite the root), `.gitignore` (`apps/web/dist` → `dist`, `apps/media/.wrangler` → `workers/media/.wrangler`, and so on) and `.env.example` comments all follow the new paths.
- **Cloudflare deploys the Workers automatically from git** (the project owner confirmed this). The dashboard settings of each Worker project must change to `workers/media` and `workers/cloud` at the moment this branch is merged, or the next deploy from `main` breaks. Any Dockerfile path set there must change too. This is outside the repo. The PR description carries a merge checklist for the owner: change the dashboard settings right after merging, then confirm the next build passes.

### Documents

- AGENTS.md: the project structure, the API tree heading (`server/src/`), the web tree heading (`src/`), the command table, every `apps/...` path, and the rule "never create a `.env` inside an app folder" (now: anywhere but the root, except the committed `server/.env.test`).
- README, `docs/install.md` and DESIGN.md wherever they name `apps/...`. Historical documents in `docs/superpowers/specs`, `plans` and work logs are left as they were written.

## Verification (what "done" means)

The project owner chose **CI only** for checks that need a database or a container runtime. Nothing here starts Docker or Podman, or uses a database from this machine.

- Locally: `bun run typecheck`, `bun run lint`, `bun run test:unit`, the web tests, `openapi:check` with **no baseline change**, and the lefthook `pre-push` all pass.
- On the PR: GitHub CI (`check`) runs `bun run test` against PostgreSQL and passes.
- **Not checked before merge (accepted by the owner):**
  - `bun run e2e` and `bun run screenshots`
  - building the install image and starting it against an empty database
  
  Because the image is the riskiest part (`WEB_DIST`, finding `drizzle/`, the entrypoint's working directory), the plan reads those paths against the Dockerfile line by line. The PR description asks the owner to build and start the image (with a separate `COMPOSE_PROJECT_NAME`, never against a live database) before tagging a release.
- `git log --follow server/src/app.ts` shows history from before the move.
- `git grep "apps/"` finds nothing outside historical documents.

## Sequencing

- The project owner merges these first, in any order: PR #23 (`shop-type-setup`), `ohmattpon/cloudflare-containers` and `ohmattpon/podman-migration`. Then `main` is merged into this branch, and the move starts. The move therefore includes `apps/cloud`, and follows the Podman versions of the install scripts, `docs/install.md` and the AGENTS.md commands, which this work does not rewrite beyond their paths.
- Commits, each leaving the branch working: (1) move the API to `server/` with its paths, (2) move the web to the root and merge the packages, (3) move the Worker, (4) Docker, CI and hooks, (5) documents. If (1) cannot be done alone (both packages share the lockfile), (1) and (2) may be one commit, with the reason in its body.

## Left to the builder

- The exact merged script lines, and whether `dev` uses `bun run --parallel` or a small `scripts/dev.ts` as the team does.
- The order of `paths` entries and of `.gitignore` lines.
