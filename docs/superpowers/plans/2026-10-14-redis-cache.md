# Redis cache implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, task by task.

**Goal:** Add optional Redis read caching with commit-aware invalidation and database fallback.

**Architecture:** Shared cache port and Bun Redis adapter; module-local repository decorators keep domain entities and authoritative transaction reads intact.

**Tech Stack:** Bun RedisClient, Redis 7.4, Elysia, tsyringe, Drizzle PostgreSQL, Docker Compose.

**Spec:** docs/superpowers/specs/2026-10-14-redis-cache-design.md

## Global constraints

- Work only in the approved worktree on ohmattpon/redis-cache.
- Commit through gitcz; never push or merge.
- No secrets in tracked files; no access to the cloud database for Docker validation.
- Keep API contracts unchanged. No new tests unless the owner requests them.

## Review focus

- A late cache fill must not overwrite an invalidated generation.
- A rollback must discard queued invalidation.
- Transactions and locks must never consume cached prices, stock or settings.
- Missing, slow, disconnected or malformed Redis data must not fail a database operation.
- Every cache key must isolate the installation, branch and list filters.

## Tasks

- [ ] Create cache port, optional config, bounded Redis adapter and read helper.
- [ ] Add after-commit callbacks to transaction context while preserving nested unit-of-work behavior.
- [ ] Decorate categories, products, modifiers and shop settings; wire DI.
- [ ] Add private Redis compose service, development port, configuration examples and operating docs.
- [ ] Check types, lint, build, OpenAPI and isolated compose configuration; record verification limits.
- [ ] Review the complete branch, commit focused changes and deliver the worktree path.

## Execution decisions

Ruling: The owner's instruction to create the separate worktree and continue authorizes implementation of the cache scope described in the chat. Continue without an additional design approval round.

Ruling: Automated behavioral tests are not added or run because the standing developer instruction requires a user request. Record this limitation explicitly.
