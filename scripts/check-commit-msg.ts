// commit-msg hook: every commit must come from gitcz (AGENTS.md, "Committing"), so its first line must look like
// `type(scope): <emoji> subject`. Merge and revert commits made by git itself are let through.
// Usage: bun scripts/check-commit-msg.ts <path to the commit message file>

const TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'style', 'perf', 'ci', 'chore'] as const

const GITCZ = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?: \\S.*[^.]$`)
const MADE_BY_GIT = /^(Merge |Revert ")/

export function checkCommitMessage(message: string): string | null {
  // Lines starting with # are comments git strips before committing. A Windows editor may add a byte-order mark.
  const subject = message.replace(/^﻿/, '').split(/\r?\n/).find((line) => line.trim() !== '' && !line.startsWith('#')) ?? ''
  if (MADE_BY_GIT.test(subject) || GITCZ.test(subject)) return null
  return [
    `Commit message "${subject}" was not written by gitcz.`,
    'Commit with gitcz instead of git commit, for example:',
    '  gitcz --non-interactive --type=feat --scope=sales --subject="hold an order open before payment"',
    `Types: ${TYPES.join(', ')} (not build; use chore). The subject must not end with a period.`,
  ].join('\n')
}

if (import.meta.main) {
  const path = Bun.argv[2]
  if (!path) {
    console.error('usage: bun scripts/check-commit-msg.ts <commit message file>')
    process.exit(2)
  }
  const problem = checkCommitMessage(await Bun.file(path).text())
  if (problem) {
    console.error(problem)
    process.exit(1)
  }
}
