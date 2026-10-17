import { describe, expect, test } from 'bun:test'

const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

async function tracked(): Promise<string[]> {
  const out = await Bun.$`git -C ${root} ls-files`.text()
  return out.split('\n').filter(Boolean)
}

/** Connection strings are fine when the password is an obvious placeholder, or comes from a variable. */
const PLACEHOLDER = /^(pos|password|postgres|test|your-[a-z0-9-]*|<[^>]*>|\.\.\.)$/i

export function findSecrets(path: string, text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/([^:@\s/'"`]+):([^@\s'"`]+)@/g)) {
    const password = match[2]!
    const isVariable = password.startsWith('${') || password.startsWith('$')
    if (!PLACEHOLDER.test(password) && !isVariable && !password.includes('<'))
      found.push(`${path}: a database connection string with a password`)
  }
  if (/AVNS_[A-Za-z0-9_-]{10,}/.test(text)) found.push(`${path}: an Aiven service password`)
  return found
}

describe('findSecrets', () => {
  test('flags a real password in a connection string, and an Aiven token', () => {
    // Built from pieces, so these examples are not themselves what the scanner is looking for.
    const url = `postgres://admin:${'S3cr3t'}Real@db.example.com:5432/x`
    expect(findSecrets('a.md', url)).toHaveLength(1)
    expect(findSecrets('a.md', ['AVNS', 'abcdefghijk123'].join('_'))).toHaveLength(1)
  })

  test('lets placeholders and variables through', () => {
    for (const url of [
      'postgres://pos:pos@localhost:5433/pos',
      'postgres://pos:${POSTGRES_PASSWORD:-pos}@db:5432/pos',
      'postgres://user:<password>@host/db',
      'postgres://user:your-password@host/db',
    ])
      expect(findSecrets('a.md', url)).toEqual([])
  })
})

describe('the repository', () => {
  test('tracks no .env or .dev.vars file', async () => {
    const files = (await tracked()).filter((path) => /(^|\/)(\.env|\.dev\.vars)$/.test(path))

    expect(files).toEqual([])
  })

  test('.env.example holds placeholders only', async () => {
    const text = await Bun.file(`${root}/.env.example`).text()
    const keys = ['SCB_API_KEY', 'SCB_API_SECRET', 'SCB_BILLER_ID', 'JWT_SECRET', 'MEDIA_TOKEN', 'POSTGRES_PASSWORD']

    for (const key of keys) {
      const line = text.split('\n').find((candidate) => candidate.startsWith(`${key}=`))
      if (line === undefined) continue
      const value = line.slice(key.length + 1).trim()
      const isPlaceholder = value === '' || value.startsWith('your-') || value === 'change-me'
      expect(isPlaceholder, `${key} in .env.example`).toBe(true)
    }
  })

  test('no tracked text file carries a real database password or service token', async () => {
    const found: string[] = []
    for (const path of await tracked()) {
      if (/\.(png|jpe?g|webp|ico|woff2?|gz|zip|pdf)$/i.test(path) || path.endsWith('bun.lock')) continue
      const file = Bun.file(`${root}/${path}`)
      if (!(await file.exists()) || file.size > 2_000_000) continue
      found.push(...findSecrets(path, await file.text()))
    }

    expect(found).toEqual([])
  })
})
