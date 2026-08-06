import { describe, it, expect } from 'vitest'
import { isUnknownHost, isConferenceUnavailable } from './guard'
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

  it('does NOT treat an error WITH a resolved conference as unknown (partial failures keep page-level error handling)', () => {
    expect(
      isUnknownHost({
        conference: { _id: 'conf-1' } as never,
        error: new Error('secondary read failed'),
      }),
    ).toBe(false)
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

  it('is FALSE for a failed read — an outage is not an unclaimed domain', () => {
    // #848. The empty conference is byte-identical in both worlds; only the
    // status separates them. Without this, `PlatformLanding` invites strangers
    // to claim a live customer's domain for the length of an outage.
    expect(
      isUnknownHost({
        conference: {} as Conference,
        error: new Error('ECONNREFUSED'),
        status: 'unavailable',
      }),
    ).toBe(false)
  })
})

describe('isConferenceUnavailable', () => {
  it('is true only for a FAILED read', () => {
    expect(
      isConferenceUnavailable({
        conference: {} as Conference,
        error: new Error('ECONNREFUSED'),
        status: 'unavailable',
      }),
    ).toBe(true)
  })

  it('is false for a host that demonstrably has no conference', () => {
    expect(
      isConferenceUnavailable({
        conference: {} as Conference,
        error: new Error('Conference not found for domain: nope.example'),
        status: 'not-found',
      }),
    ).toBe(false)
  })

  it('is false for a resolved conference, even alongside a secondary error', () => {
    expect(
      isConferenceUnavailable({
        conference: resolved,
        error: new Error('gallery read failed'),
        status: 'resolved',
      }),
    ).toBe(false)
  })

  it('never guesses: no status means no unavailability claim', () => {
    // Callers that hold only a conference (e.g. TenantThemeStyle) must not be
    // silently told "unavailable" — the whole point is to stop asserting
    // things we have not established.
    expect(isConferenceUnavailable({ conference: {} as Conference })).toBe(
      false,
    )
  })
})
