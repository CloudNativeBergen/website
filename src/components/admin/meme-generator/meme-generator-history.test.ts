// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  record,
  redo,
  startHistory,
  undo,
} from './meme-generator-history'

describe('undo and redo', () => {
  it('starts with nothing to undo or redo', () => {
    const history = startHistory('a')
    expect(history.present).toBe('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('undoes and redoes a change', () => {
    let history = record(startHistory('a'), 'b', { now: 0 })
    history = undo(history)
    expect(history.present).toBe('a')
    expect(canRedo(history)).toBe(true)
    history = redo(history)
    expect(history.present).toBe('b')
    expect(canRedo(history)).toBe(false)
  })

  it('clears redo with a new change', () => {
    let history = record(startHistory('a'), 'b', { now: 0 })
    history = undo(history)
    history = record(history, 'c', { now: 1 })
    expect(canRedo(history)).toBe(false)
    expect(redo(history)).toBe(history)
    expect(undo(history).present).toBe('a')
  })

  it('does nothing past either end', () => {
    const history = startHistory('a')
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })

  it('records nothing for a change that changes nothing', () => {
    const history = startHistory('a')
    expect(record(history, 'a', { now: 0 })).toBe(history)
  })

  it('records nothing for a new value equal to the present', () => {
    const history = record(
      startHistory<{ a: number; b: string[]; c?: number }[]>([
        { a: 1, b: ['x'] },
      ]),
      [{ a: 2, b: ['x'] }],
      {
        now: 0,
      },
    )
    const undone = undo(history)
    // Redo is still there after a change that changed nothing.
    expect(record(undone, [{ a: 1, b: ['x'] }], { now: 1 })).toBe(undone)
    expect(record(undone, [{ a: 1, b: ['y'] }], { now: 1 })).not.toBe(undone)
    expect(record(undone, [{ a: 1, b: ['x'], c: 0 }], { now: 1 })).not.toBe(
      undone,
    )
  })

  it('loses no step when, with the history full, a burst ends where it began', () => {
    let history = startHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 1; i++)
      history = record(history, i, { now: i * 10_000 })
    const full = history.past
    history = record(history, 999, { group: 'text', now: 2_000_000 })
    history = record(history, HISTORY_LIMIT + 1, {
      group: 'text',
      now: 2_000_100,
    })
    expect(history.present).toBe(HISTORY_LIMIT + 1)
    expect(history.past).toEqual(full)
  })

  it('keeps the last hundred steps', () => {
    let history = startHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++)
      history = record(history, i, { now: i * 10_000 })
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]).toBe(5)
  })
})

describe('a continuous change is one step', () => {
  it('folds changes of the same group, each within a second of the last', () => {
    let history = startHistory('')
    // Typing "hei", a key every 300 ms, then a pause and "!".
    history = record(history, 'h', { group: 'text', now: 0 })
    history = record(history, 'he', { group: 'text', now: 300 })
    history = record(history, 'hei', { group: 'text', now: 600 })
    history = record(history, 'hei!', { group: 'text', now: 2000 })
    expect(history.past).toEqual(['', 'hei'])
    expect(undo(history).present).toBe('hei')
    expect(undo(undo(history)).present).toBe('')
  })

  it('never folds changes of different groups, or ungrouped ones', () => {
    let history = startHistory(0)
    history = record(history, 1, { group: 'a', now: 0 })
    history = record(history, 2, { group: 'b', now: 10 })
    history = record(history, 3, { now: 20 })
    history = record(history, 4, { now: 30 })
    expect(history.past).toEqual([0, 1, 2, 3])
  })

  it('drops a step that a burst took back to where it started', () => {
    let history = record(startHistory('x'), '', { now: 0 })
    history = undo(history)
    // A character typed and deleted again within the second.
    history = record(history, 'xa', { group: 'text', now: 100 })
    history = record(history, 'x', { group: 'text', now: 300 })
    expect(history.present).toBe('x')
    expect(canUndo(history)).toBe(false)
  })

  it('starts a new step after an undo, even in the same group', () => {
    let history = startHistory(0)
    history = record(history, 1, { group: 'a', now: 0 })
    history = record(history, 2, { group: 'a', now: 100 })
    history = undo(history)
    history = record(history, 5, { group: 'a', now: 200 })
    expect(history.past).toEqual([0])
    expect(undo(history).present).toBe(0)
    expect(redo(undo(history)).present).toBe(5)
  })
})
