import { expect, test } from 'bun:test'
import { droppedNote, timeLapseNote } from './run-notes'

test('a full-length run gets no time-lapse note; a compressed one says its numbers are not comparable', () => {
  expect(timeLapseNote(1)).toBeNull()
  const note = timeLapseNote(0.15)!
  expect(note).toContain('time-lapsed')
  expect(note).toContain('every rate x 6.7)')
  expect(note).toContain('not comparable')
})

test('no dropped arrivals, no note', () => {
  expect(droppedNote('stress', 0, 100)).toBeNull()
  expect(droppedNote('load', undefined, 100)).toBeNull()
})

test('dropped arrivals are reported as a share of all arrivals', () => {
  expect(droppedNote('load', 25, 75)).toBe('Dropped iterations: 25 of 100 arrivals (25.0%): the tills could not take them in time')
})

test('in stress, dropped arrivals mean the tills are saturated, and the note says so', () => {
  const note = droppedNote('stress', 162, 381)!
  expect(note).toContain('162 of 543 arrivals (29.8%)')
  expect(note).toContain('SATURATED')
})
