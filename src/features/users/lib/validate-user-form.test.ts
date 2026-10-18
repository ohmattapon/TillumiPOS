import { describe, expect, test } from 'bun:test'
import { validateUserForm } from './validate-user-form'

const validNew = { username: 'buddee', displayName: 'บุตรดี มีโชค', password: 's3cret-pass', isNew: true }

describe('validateUserForm', () => {
  test('accepts a valid new user, including surrounding spaces in the name', () => {
    expect(validateUserForm(validNew)).toEqual({})
    expect(validateUserForm({ ...validNew, username: '  buddee  ' })).toEqual({})
  })

  test('accepts uppercase names because the server lower-cases them', () => {
    expect(validateUserForm({ ...validNew, username: 'BudDee' })).toEqual({})
  })

  test('flags an empty username, and a bad one stays fixable', () => {
    expect(validateUserForm({ ...validNew, username: '' }).username).toBe('required')
    expect(validateUserForm({ ...validNew, username: 'ab' }).username).toBe('invalid')
    expect(validateUserForm({ ...validNew, username: 'x'.repeat(33) }).username).toBe('invalid')
    expect(validateUserForm({ ...validNew, username: 'som chai' }).username).toBe('invalid')
    expect(validateUserForm({ ...validNew, username: 'สมชาย' }).username).toBe('invalid')
  })

  test('requires a display name and, for a new user, a password of 8+', () => {
    expect(validateUserForm({ ...validNew, displayName: '   ' }).displayName).toBe('required')
    expect(validateUserForm({ ...validNew, password: '' }).password).toBe('required')
    expect(validateUserForm({ ...validNew, password: 'short' }).password).toBe('tooShort')
  })

  test('edit mode skips the username and an untouched password', () => {
    expect(validateUserForm({ ...validNew, isNew: false, password: '' })).toEqual({})
    expect(validateUserForm({ ...validNew, isNew: false, password: 'short' }).password).toBe('tooShort')
  })
})
