import { describe, it, expect } from 'vitest'
import { isUnknownHost } from './guard'
import type { Conference } from './types'

// A minimal resolved conference — only `_id` matters to the guard.
const resolved = { _id: 'conf-123', title: 'Cloud Native Bergen' } as Conference

describe('isUnknownHost', () => {
  it('passes a resolved conference through (not an unknown host)', () => {
    expect(isUnknownHost({ conference: resolved, error: null })).toBe(false)
  })

  it('treats the resolver miss shape (empty conference + error) as unknown', () => {
    // This is exactly what getConferenceForDomain returns for an unresolvable
    // Host — a TRUTHY `{} as Conference` plus an error. It is what crashed the
    // cfp page (`conference.formats.filter`); the guard must catch it.
    expect(
      isUnknownHost({
        conference: {} as Conference,
        error: new Error('Conference not found for domain: nope.example'),
      }),
    ).toBe(true)
  })

  it('treats an empty conference with no error as unknown (bare !conference never fires)', () => {
    expect(isUnknownHost({ conference: {} as Conference, error: null })).toBe(
      true,
    )
  })

  it('treats any error as unknown even if a partial conference is present', () => {
    expect(
      isUnknownHost({ conference: resolved, error: new Error('boom') }),
    ).toBe(true)
  })

  it('treats a conference missing an _id as unknown', () => {
    expect(
      isUnknownHost({ conference: { title: 'x' } as Conference, error: null }),
    ).toBe(true)
  })

  it('tolerates an omitted error field', () => {
    expect(isUnknownHost({ conference: resolved })).toBe(false)
    expect(isUnknownHost({ conference: {} as Conference })).toBe(true)
  })
})
