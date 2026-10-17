# One Root Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay POS out like the team's projects: one `package.json` at the root, the API in `server/`, the web and tooling at the root, and the Workers in `workers/`. Nothing about behavior changes.

**Architecture:** Move files with `git mv` in four working steps:
1. the API into `server/`, still as a workspace package
2. the web up to the root, merged with the API into one package, with `@pos/api/*` becoming a path alias
3. the Workers into `workers/*`
4. build, CI and hooks follow the paths

Documents come last. Static tests pin the paths the install image depends on, because the image is not built before merge.

**Tech Stack:** Bun workspaces, Vite 8, TypeScript 6 project references, Drizzle migrator, Docker/Podman, lefthook, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-17-single-package-layout-design.md`

## Global Constraints

- Branch `ohmattpon/single-package-layout`. Commit only with `gitcz --non-interactive`, and end every `--body` with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only this branch. Never merge or open PRs: those are the project owner's job.
- **Do not start until** PR #23, `ohmattpon/cloudflare-containers` and `ohmattpon/podman-migration` are all in `origin/main` (Task 0 checks this).
- Move with `git mv` only, so `git log --follow` keeps working. Never copy and delete.
- No behavior change: `server/test/openapi-baseline.json` and `openapi-v2-baseline.json` stay byte-identical, and no migration SQL or `meta/` file changes content.
- Keep `@pos/api` as the import name (now a path alias). Keep every command name in AGENTS.md's command table.
- **Never start Docker or Podman, and never use a database from this machine** (the owner chose CI only). Integration tests, e2e, screenshots and the image build are not run locally.
- Lockfile: when the API and the web pin different versions of one package, keep the higher one and name it in the commit body.
- Paths that stay the same depth and need no edit: `workers/media/package.json` (`--env-file ../../.env`) and `workers/cloud/wrangler.jsonc` (`"image": "../../Dockerfile"`, `"image_build_context": "../.."`).

## Review Focus

1. **The install image** (not built before merge). The `COPY` sources must exist, `WEB_DIST` must equal Vite's output folder, and the entrypoint must start where `drizzle/` is found. → Task 4 adds `server/src/__tests__/install-image-paths.test.ts`.
2. **`bun test` path filters.** From the root, a bare `src` also matches `server/src`, and those tests would then run without their preload. The web suite must still run exactly the web tests, and the API suite exactly the API tests. → Task 2 Step 5 compares test counts with the Task 0 numbers.
3. **Migrations found from every working directory** (root scripts, `server/` tests, Docker `/repo/server`). → Task 1 pins `MIGRATIONS_FOLDER` with a test.
4. **Local images in development** move from `apps/api/data/media` to `data/media`, because the API now runs from the root and `MEDIA_DIR` defaults to `./data/media`. Images a developer uploaded before would seem to disappear. → Task 4 adds `data/` to `.gitignore`, and Task 6's PR text tells the owner to move the folder.
5. **The Cloudflare auto-deploy** from `main` breaks until the dashboard root folders change. → Task 6 puts a merge checklist in the PR text.

---

### Task 0: Preconditions and baseline numbers

- [ ] **Step 1: Check that the three branches have landed**

Run:
```bash
git fetch -q && for b in ohmattpon/shop-type-setup ohmattpon/cloudflare-containers ohmattpon/podman-migration; do git merge-base --is-ancestor origin/$b origin/main && echo "$b merged" || echo "$b NOT merged"; done
```
Expected: three "merged" lines. If any says NOT merged, **stop and ask the project owner**. Do not merge them yourself.

- [ ] **Step 2: Bring `main` into this branch**: `git merge origin/main`, through `gitcz` if a merge commit message is needed (the hook rejects other messages). Expected: no conflicts, because this branch holds only the spec and this plan.

- [ ] **Step 3: Record the baseline** in the ledger. Run each, and write down its pass count and file count:
  - `bun run test:unit`
  - `bun run --filter @pos/web test`
  - `bun run typecheck` (exit 0)
  - `bun run --filter @pos/api openapi:check` (match)
  - `cd apps/web && bunx vite build` (exit 0, and note its output folder)

  `git grep -l "apps/" -- ':!docs/superpowers' ':!docs/work-log*' ':!bun.lock'` lists the files that still have to change.

---

### Task 1: The API moves to `server/`, and migrations to the root

**Files:**
- Move: `apps/api/` → `server/` (all of it), except `apps/api/drizzle/` → `drizzle/` and `apps/api/drizzle.config.ts` → `drizzle.config.ts`
- Create: `server/src/infrastructure/database/migrations-folder.ts`, `server/src/infrastructure/database/migrations-folder.test.ts`
- Modify: `server/src/infrastructure/database/migrate.ts`, `server/test/harness.ts`, `drizzle.config.ts`, `server/package.json` (scripts), root `package.json` (`"workspaces": ["apps/*", "server", "workers/*"]`, `scb:inquiry` path), `server/src/__tests__/repo-secrets.test.ts` (`root` is now `'../../..'`), `scripts/check-secret-files.ts` and its test (`server/.env.test` is the allowed file)

**Interfaces:**
- Produces: `export const MIGRATIONS_FOLDER: string`, the absolute path of the root `drizzle/`, resolved from the module's own URL.

- [ ] **Step 1: Move the files** with `git mv`, then `bun install` so the workspace sees `server/`.

- [ ] **Step 2: Write the failing test** `migrations-folder.test.ts`:

```ts
test('points at the repo-root drizzle folder whatever the working directory', () => {
  expect(MIGRATIONS_FOLDER.replaceAll('\\', '/')).toMatch(/\/drizzle$/)
  expect(existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true)
  expect(existsSync(join(MIGRATIONS_FOLDER, '0018_shop_features.sql'))).toBe(true)
})
```

And in `scripts/check-secret-files.test.ts`: `findSecretFiles(['server/.env.test'])` is `[]`, and `findSecretFiles(['server/.env'])` is `['server/.env']`.

- [ ] **Step 3: Run them and see them fail**: `cd server && bun test src/infrastructure/database/migrations-folder.test.ts` and `bun test scripts/check-secret-files.test.ts`. Expected: FAIL (module missing; `server/.env.test` reported).

- [ ] **Step 4: Implement**
  - `MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../../drizzle', import.meta.url))`
  - `migrate.ts` and `harness.ts` use it instead of `'./drizzle'`
  - `drizzle.config.ts` uses `schema: './server/src/infrastructure/database/schema/index.ts'` and `out: './drizzle'`. The `db:*` scripts run drizzle-kit from the root with `--config ../drizzle.config.ts`, or are moved to the root package in Task 2. Choose one and ledger it.
  - Update `ALLOWED` in `check-secret-files.ts`.

- [ ] **Step 5: Verify**
  - `bun run test:unit` gives the Task 0 count
  - `bun run typecheck` exits 0
  - `cd server && bun --env-file=.env.test test/openapi-snapshot.ts check` matches
  - `git diff --stat -M HEAD` shows the moves as renames (R100) for `drizzle/` and the baselines
  - `git log --follow --oneline server/src/app.ts | tail -1` shows a commit from before the move

- [ ] **Step 6: Commit**: `gitcz --type=refactor --subject="move the API to server/ and the migrations to the repo root"`

---

### Task 2: The web goes to the root as the one package

**Files:**
- Move: `apps/web/{src,public,index.html,vite.config.ts,components.json,tsconfig.json,tsconfig.app.json,tsconfig.node.json}` → root, and `apps/web/e2e/` → `e2e/`
- Merge: `apps/web/package.json` and `server/package.json` → root `package.json`. Delete both, and `"workspaces": ["workers/*"]`.
- Modify: `vite.config.ts`, `tsconfig.app.json`, `server/tsconfig.json`, root `package.json` scripts, `bunfig.toml`

**Interfaces:**
- Consumes: `server/` (Task 1).
- Produces: the root scripts, all keeping their names:
  - `dev`
  - `test`, `test:unit`, `test:web`
  - `typecheck`, `lint`
  - `openapi:check`
  - `db:generate`, `db:migrate`, `db:seed`, `db:seed:demo`, `db:seed:catalog`, `db:studio`, `db:up`, `cache:up`
  - `e2e`, `screenshots`, `scb:inquiry`
  - `deploy:media`, `deploy:cloud`, `hooks:install`

  `@pos/api` resolves as an alias with the same subpaths it exported: `.`, `types`, `pricing`, `shop-settings`, `modifiers`, `promotions`, `dining-table`, `permissions`.

- [ ] **Step 1: Move the files** with `git mv`.

- [ ] **Step 2: Merge the package files**: dependencies, devDependencies and scripts, under the spec's rules.
  - API scripts run from the root with `--env-file=.env`.
  - API tests: `cd server && bun --env-file=.env.test test`. `test:unit` also stays within `server`.
  - Web tests: `bun test ./src`.
  - `typecheck`: `tsc -b && tsc -p server && bun run --filter '*' typecheck` (the last part covers the Workers).
  - `lint`: `oxlint src e2e`.
  - Run `bun install` and read the `bun.lock` diff. It may only lose the two workspace entries and merge duplicate versions.

- [ ] **Step 3: Paths**
  - `vite.config.ts`: `envDir: '.'`, and `resolve.alias` gains one entry per `@pos/api` subpath, plus `@pos/api` itself pointing at `server/src/app.ts`.
  - `tsconfig.app.json`: the same entries in `paths`. `include` is `["src"]`.
  - `tsconfig.node.json`: covers `vite.config.ts` and `e2e/`.
  - `server/tsconfig.json`: `"include": ["src", "test", "scripts"]`.
  - Root `bunfig.toml`: keeps only `env = false`. `server/bunfig.toml` keeps the preload.

- [ ] **Step 4: e2e paths**: in `e2e/run.ts` and `e2e/shots.ts`, `root` is `'..'` from the file, the API `cwd` is `${root}/server`, and the Vite `cwd` is `root`.

- [ ] **Step 5: Verify** (Review Focus 2)
  - `bun run test:unit` gives the same pass count as Task 0
  - `bun run test:web` gives the same pass count and file count as Task 0's web run, so no `server/` test leaks in
  - `bun run typecheck` and `bun run lint` exit 0
  - `bunx vite build` exits 0 and writes `dist/`
  - `bun run openapi:check` matches

- [ ] **Step 6: Commit**: `gitcz --type=refactor --subject="make the web and the API one package at the repo root"`. The body names any merged version and says why Tasks 1–2 could not be one move.

---

### Task 3: Workers move to `workers/`

**Files:** Move `apps/media/` → `workers/media/` and `apps/cloud/` → `workers/cloud/`. Then `apps/` must be empty, so remove it. Modify the root scripts `dev` (the media worker), `deploy:media` and `deploy:cloud` (`--filter @pos/media` / `@pos/cloud` still work).

- [ ] **Step 1:** `git mv` both, then `bun install`.
- [ ] **Step 2: Verify**
  - `bun run typecheck` exits 0, which includes `wrangler types && tsc` for both Workers
  - `ls apps` fails (the folder is gone)
  - `grep -n '\.\./\.\.' workers/*/wrangler.jsonc workers/*/package.json` still resolves to the repo root
- [ ] **Step 3: Commit**: `gitcz --type=refactor --subject="move the Cloudflare Workers to workers/"`

---

### Task 4: Install image, CI and hooks follow the new paths

**Files:**
- Create: `server/src/__tests__/install-image-paths.test.ts`
- Modify: `Dockerfile`, `docker/entrypoint.sh`, `.dockerignore`, `.gitignore`, `.github/workflows/ci.yml` (comments and any paths), `lefthook.yml` (the lint job loses `root: "apps/web/"`, with `glob: "{src,e2e}/**/*.{ts,tsx}"`; the web test job runs `bun run test:web`; the OpenAPI job runs `bun run openapi:check`)

- [ ] **Step 1: Write the failing test** (Review Focus 1). It reads `Dockerfile`, `docker/entrypoint.sh` and `vite.config.ts` from the repo root as text:

```ts
test('every COPY source in the Dockerfile exists', ...)            // each `COPY <src>` path other than `.` exists
test('WEB_DIST is where vite build writes', ...)                    // WEB_DIST === `/repo/${outDir ?? 'dist'}`
test('the entrypoint starts where the migrations are found', ...)   // `cd /repo/server`, and drizzle/ is at /repo/drizzle (MIGRATIONS_FOLDER resolves from the file, so cwd only has to hold src/)
test('no path in the image still points into apps/', ...)           // no 'apps/' in Dockerfile, entrypoint, .dockerignore
```

- [ ] **Step 2: Run it and see it fail** (the Dockerfile still copies `apps/...`).

- [ ] **Step 3: Implement**
  - `Dockerfile`:
    - copy `package.json bun.lock bunfig.toml` and `workers/media/package.json workers/cloud/package.json`, then `bun install --frozen-lockfile`
    - copy `.`
    - `RUN bunx vite build`
    - `WEB_DIST=/repo/dist`
  - `entrypoint.sh`: `cd /repo/server`
  - `.dockerignore`: `dist`
  - `.gitignore`: replace each `apps/...` line with its new path, and add `data/` (Review Focus 4)

- [ ] **Step 4: Verify**
  - The new test passes.
  - `bun run lefthook run pre-push` (or a real push in Task 6) runs every job, and none is skipped.
  - `bun test scripts` passes.

- [ ] **Step 5: Commit**: `gitcz --type=chore --subject="point the install image, CI and git hooks at the new layout"`

---

### Task 5: Documents

**Files:** `AGENTS.md`, `README.md`, `docs/install.md`, `docs/cloudflare.md`, `DESIGN.md`, `.env.example`, and the comments in `server/src/libs/env.ts`, `server/src/modules/shared/adapters/worker-media-storage.ts` and `server/test/media-server.ts`.

- [ ] **Step 1: AGENTS.md**
  - Project structure, and the trees: `server/src/` replaces `apps/api/src/`, and `src/` replaces `apps/web/src/`.
  - The command table, with the same names.
  - The `.env` rule: no `.env` anywhere but the root, except the committed `server/.env.test`.
  - The lefthook paragraph.
  - Any `apps/...` path.
- [ ] **Step 2:** The other files: every `apps/api` → `server`, `apps/web` → root, `apps/media` / `apps/cloud` → `workers/...`. In `docs/install.md` the `git diff ... -- apps/api/drizzle` check becomes `-- drizzle`.
- [ ] **Step 3: Verify**
  - `git grep -n "apps/" -- ':!docs/superpowers' ':!docs/work-log*' ':!docs/summary.md' ':!bun.lock'` prints nothing.
  - `bun run typecheck && bun run test:unit && bun run test:web` pass.
- [ ] **Step 4: Commit**: `gitcz --type=docs --subject="describe the one-package layout in the guides"`

---

### Task 6: Push and hand over

- [ ] **Step 1:** `git push`. The pre-push hook must pass with all jobs run. Report the branch and the latest commit.
- [ ] **Step 2: Wait for CI**: run `gh run watch` on the branch's latest run. `check` must pass, which proves the integration tests against PostgreSQL.
- [ ] **Step 3: Write the PR text** to `.superpowers/sdd/2026-10-17-single-package-layout/pr-body.md` for the owner to open (`gh pr create` is the owner's). It contains:
  - a summary and the before/after tree
  - **Merge checklist:**
    - right after merging, set the Cloudflare dashboard root folders to `workers/media` and `workers/cloud` (and the container's Dockerfile path, if one is set there)
    - confirm the next Workers build
  - **Before the next release:** build and start the install image with a separate `COMPOSE_PROJECT_NAME` against an empty database, then open `/`
  - **For developers:**
    - move `apps/api/data/media` to `data/media`
    - run `bun install` again
    - rerun `bun run hooks:install` is not needed
  - Not run before merge: e2e, screenshots, the image build (owner's choice)
