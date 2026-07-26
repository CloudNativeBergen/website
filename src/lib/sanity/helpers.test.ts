import { describe, it, expect } from 'vitest'
import { ensureUniqueArrayKeys } from './helpers'

describe('ensureUniqueArrayKeys', () => {
  it('keeps unique client keys and fills missing ones', () => {
    const out = ensureUniqueArrayKeys(
      [{ _key: 'a', v: 1 }, { v: 2 }, { _key: 'b', v: 3 }],
      'x',
    )
    expect(out[0]._key).toBe('a')
    expect(out[2]._key).toBe('b')
    expect(out[1]._key).toBeTruthy()
    expect(out[1]._key).not.toBe('a')
    expect(out[1]._key).not.toBe('b')
  })

  it('drops and regenerates duplicate keys (first occurrence wins)', () => {
    const out = ensureUniqueArrayKeys(
      [
        { _key: 'dup', v: 1 },
        { _key: 'dup', v: 2 },
        { _key: 'dup', v: 3 },
      ],
      'x',
    )
    expect(out[0]._key).toBe('dup')
    expect(out[1]._key).not.toBe('dup')
    expect(out[2]._key).not.toBe('dup')
    const keys = out.map((o) => o._key)
    expect(new Set(keys).size).toBe(3)
    // Values untouched.
    expect(out.map((o) => o.v)).toEqual([1, 2, 3])
  })
})
