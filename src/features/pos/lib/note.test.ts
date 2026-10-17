import { describe, expect, test } from 'bun:test'
import { noteToSave } from './note'

describe('noteToSave', () => {
  test('a changed note is sent as typed, trimmed', () => {
    expect(noteToSave('  no ice  ', null)).toBe('no ice')
    expect(noteToSave('no ice', 'extra ice')).toBe('no ice')
  })

  test('a note equal to the loaded one sends nothing', () => {
    expect(noteToSave('no ice', 'no ice')).toBeUndefined()
    expect(noteToSave('  no ice ', 'no ice')).toBeUndefined()
  })

  test('an empty field on a line without a note sends nothing', () => {
    expect(noteToSave('', null)).toBeUndefined()
    expect(noteToSave('   ', null)).toBeUndefined()
  })

  test('clearing a note sends null', () => {
    expect(noteToSave('', 'no ice')).toBeNull()
    expect(noteToSave('   ', 'no ice')).toBeNull()
  })
})
