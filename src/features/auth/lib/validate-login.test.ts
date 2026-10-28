import { describe, expect, test } from 'bun:test'
import { validateLoginInput } from './validate-login'

describe('validateLoginInput', () => {
  test('flags both empty fields', () => {
    expect(validateLoginInput({ username: '', password: '' })).toEqual(['username', 'password'])
  })

  test('flags only the empty field', () => {
    expect(validateLoginInput({ username: 'owner', password: '' })).toEqual(['password'])
    expect(validateLoginInput({ username: '', password: 'secret' })).toEqual(['username'])
  })

  test('passes when both are filled', () => {
    expect(validateLoginInput({ username: 'owner', password: 'secret' })).toEqual([])
  })

  test('leaves non-empty input to the server', () => {
    expect(validateLoginInput({ username: '  ', password: '  ' })).toEqual([])
  })
})
