import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strings } from './strings'

const html = readFileSync(join(import.meta.dir, 'wait-page.html'), 'utf8')

describe('wait-page.html', () => {
  test('shows the texts from strings.ts, so there is one place to edit them', () => {
    expect(html).toContain(strings.waiting.title)
    expect(html).toContain(strings.waiting.message)
    expect(html).toContain(strings.waiting.hint)
    expect(html).toContain(strings.waiting.retrying)
  })

  test('runs no script (the retry loop lives in the main process)', () => {
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html.toLowerCase()).not.toMatch(/\son[a-z]+\s*=/)
  })

  test('loads no remote or external resource', () => {
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toMatch(/\s(src|href)\s*=/i)
    expect(html).not.toMatch(/@import|url\(/i)
  })

  test('forbids everything but its own inline style', () => {
    expect(html).toContain("default-src 'none'")
  })
})
