import { describe, expect, test } from 'bun:test'
import { checkCommitMessage } from './check-commit-msg'

describe('checkCommitMessage', () => {
  test.each([
    'feat(sales): 🎸 hold an order open before payment',
    'fix: 🐛 keep the receipt number per branch',
    'docs(agents): ✏️ add version control practices built around gitcz\n\nBody line.\n\nCo-Authored-By: X <x@y>',
    'chore(web): 🤖 bump vite',
    'Merge pull request #20 from ohmattapon/ohmattpon/design-md-english',
    'Revert "feat(sales): 🎸 hold an order open before payment"',
    '# a comment git strips\nfeat(web): 🎸 add a page',
    '﻿feat(web): 🎸 add a page saved by a Windows editor',
  ])('accepts %p', (message) => {
    expect(checkCommitMessage(message)).toBeNull()
  })

  test.each([
    ['a plain message', 'fixed stuff'],
    ['an unknown type', 'build(api): 🤖 bump bun'],
    ['a subject that ends with a period', 'feat(sales): 🎸 hold an order.'],
    ['an upper-case scope', 'feat(Sales): 🎸 hold an order'],
    ['a missing space after the colon', 'feat(sales):hold an order'],
    ['an empty message', ''],
  ])('rejects %s', (_label, message) => {
    expect(checkCommitMessage(message)).toContain('gitcz')
  })
})
