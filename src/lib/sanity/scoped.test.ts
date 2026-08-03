import { describe, it, expect, vi } from 'vitest'
import {
  ORG_FILTER,
  CONFERENCE_FILTER,
  scopePredicate,
  scopeParams,
  scopedQuery,
  scopedFetch,
} from './scoped'

describe('predicate constants', () => {
  it('bind the documented reference paths', () => {
    expect(CONFERENCE_FILTER).toBe('conference._ref == $conferenceId')
    expect(ORG_FILTER).toBe('organization._ref == $orgId')
  })
})

describe('scopePredicate', () => {
  it('composes conference then org, joined by &&', () => {
    expect(scopePredicate({ conferenceId: 'c1', orgId: 'o1' })).toBe(
      'conference._ref == $conferenceId && organization._ref == $orgId',
    )
  })

  it('emits a single predicate for a single dimension', () => {
    expect(scopePredicate({ conferenceId: 'c1' })).toBe(CONFERENCE_FILTER)
    expect(scopePredicate({ orgId: 'o1' })).toBe(ORG_FILTER)
  })

  it('is empty when no dimension is present (null/undefined)', () => {
    expect(scopePredicate({})).toBe('')
    expect(scopePredicate({ conferenceId: null, orgId: undefined })).toBe('')
  })
})

describe('scopeParams', () => {
  it('binds only the present dimensions', () => {
    expect(scopeParams({ conferenceId: 'c1', orgId: 'o1' })).toEqual({
      conferenceId: 'c1',
      orgId: 'o1',
    })
    expect(scopeParams({ conferenceId: 'c1' })).toEqual({ conferenceId: 'c1' })
    expect(scopeParams({ orgId: null })).toEqual({})
  })
})

describe('scopedQuery', () => {
  it('prepends the predicate immediately after the root `*[`', () => {
    const body = `*[_type == "notification" && recipient._ref == $speakerId] | order(createdAt desc) [0...20] { _id }`
    expect(scopedQuery({ conferenceId: 'c1' }, body)).toBe(
      `*[conference._ref == $conferenceId && (_type == "notification" && recipient._ref == $speakerId)] | order(createdAt desc) [0...20] { _id }`,
    )
  })

  it('scopes a count() query by injecting into its inner filter', () => {
    const body = `count(*[_type == "notification" && !defined(readAt)])`
    expect(scopedQuery({ conferenceId: 'c1' }, body)).toBe(
      `count(*[conference._ref == $conferenceId && (_type == "notification" && !defined(readAt))])`,
    )
  })

  it('composes both dimensions in front of the body', () => {
    const body = `*[_type == "talk"]._id`
    expect(scopedQuery({ conferenceId: 'c1', orgId: 'o1' }, body)).toBe(
      `*[conference._ref == $conferenceId && organization._ref == $orgId && (_type == "talk")]._id`,
    )
  })

  it('parenthesizes an existing top-level || so the scope cannot be bypassed', () => {
    const body = `*[_type == "talk" || _type == "workshop"]._id`
    expect(scopedQuery({ conferenceId: 'c1' }, body)).toBe(
      `*[conference._ref == $conferenceId && (_type == "talk" || _type == "workshop")]._id`,
    )
  })

  it('returns the body unchanged for an empty scope (best-effort degrade)', () => {
    const body = `*[_type == "talk"]._id`
    expect(scopedQuery({}, body)).toBe(body)
  })

  it('throws when the body has no `*[` root filter to scope', () => {
    expect(() => scopedQuery({ conferenceId: 'c1' }, 'count(0)')).toThrow(
      /no `\*\[` root filter/,
    )
  })
})

describe('scopedFetch', () => {
  it('runs the scoped query and merges scope bindings into params', async () => {
    const fetch = vi.fn().mockResolvedValue(3)
    const result = await scopedFetch<number>(
      { fetch },
      { conferenceId: 'c1' },
      `count(*[_type == "notification" && recipient._ref == $speakerId])`,
      { speakerId: 's1' },
    )
    expect(result).toBe(3)
    expect(fetch).toHaveBeenCalledWith(
      `count(*[conference._ref == $conferenceId && (_type == "notification" && recipient._ref == $speakerId)])`,
      { speakerId: 's1', conferenceId: 'c1' },
      undefined,
    )
  })

  it('lets the scope binding win over a caller param of the same name', async () => {
    const fetch = vi.fn().mockResolvedValue([])
    await scopedFetch(
      { fetch },
      { conferenceId: 'authoritative' },
      `*[_type == "x"]`,
      { conferenceId: 'stale' },
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      { conferenceId: 'authoritative' },
      undefined,
    )
  })

  it('forwards options verbatim (e.g. cache: no-store)', async () => {
    const fetch = vi.fn().mockResolvedValue([])
    await scopedFetch(
      { fetch },
      { conferenceId: 'c1' },
      `*[_type == "conversation"]`,
      {},
      { cache: 'no-store' },
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      { conferenceId: 'c1' },
      { cache: 'no-store' },
    )
  })

  // FAIL CLOSED (#616): an unresolvable tenant must never become a global read.
  it('THROWS instead of running the body unscoped when the scope is empty', async () => {
    const fetch = vi.fn().mockResolvedValue([])
    await expect(
      scopedFetch({ fetch }, {}, `*[_type == "x"]`, { a: 1 }),
    ).rejects.toThrow(/empty tenant scope/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('THROWS on a scope whose dimensions are explicitly null', async () => {
    const fetch = vi.fn().mockResolvedValue([])
    await expect(
      scopedFetch(
        { fetch },
        { orgId: null, conferenceId: null },
        `*[_type == "x"]`,
      ),
    ).rejects.toThrow(/empty tenant scope/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
