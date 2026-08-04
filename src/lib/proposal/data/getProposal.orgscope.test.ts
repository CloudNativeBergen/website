/**
 * @vitest-environment node
 *
 * B1 (#642) — getProposal's ORGANIZER branch must be ORG-SCOPED. Before the fix
 * the organizer branch dropped ALL scoping (`speakerFilter = ''` →
 * `*[_type=="talk" && _id==$id]`), so an organizer of ANY org could read another
 * tenant's proposal by exact id. These pin the GROQ the organizer branch now
 * emits: it constrains the proposal to the conferences of the passed org, and
 * FAILS CLOSED (matches nothing) when no org is supplied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { getProposal } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue({ _id: 'talk-1' })
})

const lastCall = () => {
  const [query, params] = fetchMock.mock.calls.at(-1) as [
    string,
    Record<string, unknown>,
  ]
  return { query, params }
}

describe('getProposal — organizer branch org scoping (B1)', () => {
  it('scopes the organizer read to the org’s conferences (never an unscoped id read)', async () => {
    await getProposal({
      id: 'talk-A',
      speakerId: 'org-user',
      isOrganizer: true,
      organizerOrgId: 'org-A',
    })
    const { query, params } = lastCall()
    expect(query).toContain(
      'conference._ref in *[_type == "conference" && organization._ref == $organizerOrgId]._id',
    )
    // The pre-fix unscoped organizer query had NO extra predicate after _id==$id.
    expect(query).not.toMatch(/_id==\$id\s*\]\{/)
    expect(params.organizerOrgId).toBe('org-A')
  })

  it('FAILS CLOSED when the organizer branch has no resolvable org (matches nothing)', async () => {
    await getProposal({
      id: 'talk-A',
      speakerId: 'org-user',
      isOrganizer: true,
      organizerOrgId: null,
    })
    const { query } = lastCall()
    expect(query).toContain('&& false')
    expect(query).not.toContain('organization._ref == $organizerOrgId')
  })

  it('non-organizer (owner) branch stays speaker-scoped, ignoring org', async () => {
    await getProposal({
      id: 'talk-A',
      speakerId: 'sp-1',
      isOrganizer: false,
      organizerOrgId: 'org-A',
    })
    const { query, params } = lastCall()
    // PARAMETERISED (#731 F3): the owner scope is a bound `$speakerId`, never an
    // interpolated value that a `"` could break out of.
    expect(query).toContain('$speakerId in speakers[]._ref')
    expect(query).not.toContain('"sp-1"')
    expect(params.speakerId).toBe('sp-1')
    expect(query).not.toContain('organization._ref == $organizerOrgId')
  })
})
