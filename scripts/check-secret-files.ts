// pre-commit hook: secret files must never be committed (AGENTS.md, "Committing"). Written in TypeScript rather than
// as a shell line because lefthook does not run hook commands through a shell on Windows.
// Usage: bun scripts/check-secret-files.ts <staged file>...

// .env.example holds placeholders and server/.env.test is test-only config; both are meant to be tracked.
const ALLOWED = new Set(['.env.example', 'server/.env.test'])

export function findSecretFiles(paths: readonly string[]): string[] {
  return paths
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => {
      if (ALLOWED.has(path)) return false
      const name = path.split('/').at(-1) ?? ''
      return name === '.env' || name.startsWith('.env.') || name === '.dev.vars' || path.split('/').includes('.wrangler')
    })
}

if (import.meta.main) {
  const secrets = findSecretFiles(Bun.argv.slice(2))
  if (secrets.length > 0) {
    console.error(`Secret files must not be committed (see AGENTS.md). Unstage them:\n  ${secrets.join('\n  ')}`)
    process.exit(1)
  }
}
