import { expect, test } from 'bun:test'
import { redactUrls } from './redact'

test('a connection string in child output is replaced, the rest is kept', () => {
  const out = redactUrls(`error: connect failed postgres://pos:${'s3cret'}@127.0.0.1:5434/pos_load now\nretry`)
  expect(out).not.toContain('s3cret')
  expect(out).toContain('connect failed')
  expect(out).toContain('retry')
})
