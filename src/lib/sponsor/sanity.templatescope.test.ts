import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cross-tenant deny tests for sponsor email templates (#616/#19).
 *
 * `sponsorEmailTemplate` carries an `organization` ref. Before the scoping fix
 * the reads were unscoped and the set-default / reorder / update / delete
 * mutations operated on any id — a tenant organizer could READ and, worse,
 * MUTATE another org's templates. These tests exercise a two-org store through
 * a fetch mock that honours the injected `organization._ref == $orgId`
 * predicate, and assert BOTH directions: a foreign template is never returned by
 * a read, and a mutation targeting a foreign template is rejected with no write.
 */

interface Tpl {
  _id: string
  organization: { _ref: string }
  category: string
  isDefault: boolean
  title: string
}

const STORE: Tpl[] = [
  {
    _id: 't-A',
    organization: { _ref: 'org-A' },
    category: 'welcome',
    isDefault: false,
    title: 'A welcome',
  },
  {
    _id: 't-B',
    organization: { _ref: 'org-B' },
    category: 'welcome',
    isDefault: true,
    title: 'B welcome',
  },
]

// A minimal GROQ-aware evaluator: applies the org predicate (only when the
// scoped query injected it) plus the id / ids / category / isDefault filters
// the template queries use, then returns a single doc (`[0]`) or an array.
function evalFetch(query: string, params: Record<string, unknown> = {}) {
  const scoped = query.includes('organization._ref == $orgId')
  let rows = STORE.filter((t) =>
    scoped ? t.organization._ref === params.orgId : true,
  )
  if (query.includes('_id == $id'))
    rows = rows.filter((t) => t._id === params.id)
  if (query.includes('_id != $id'))
    rows = rows.filter((t) => t._id !== params.id)
  if (query.includes('_id in $ids'))
    rows = rows.filter((t) => (params.ids as string[]).includes(t._id))
  if (query.includes('category == $category'))
    rows = rows.filter((t) => t.category === params.category)
  if (query.includes('isDefault == true'))
    rows = rows.filter((t) => t.isDefault === true)
  if (query.includes('[0]')) {
    const row = rows[0]
    if (!row) return null
    if (query.includes('._id')) return row._id
    return row
  }
  return rows
}

const fetchMock = vi.fn((query: string, params?: Record<string, unknown>) =>
  Promise.resolve(evalFetch(query, params)),
)
const deleteMock = vi.fn().mockResolvedValue({})
const commitMock = vi.fn().mockResolvedValue({})
const patchSetMock = vi.fn()
const txPatchIds: string[] = []
const txCommitMock = vi.fn().mockResolvedValue({})

vi.mock('@/lib/sanity/client', () => ({
  // Imported (unused in these paths) by the real @/lib/organization/sanity.
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: {
    fetch: (q: string, p?: Record<string, unknown>) => fetchMock(q, p),
    delete: (id: string) => deleteMock(id),
    patch: (id: string) => {
      const builder = {
        set: (obj: Record<string, unknown>) => {
          patchSetMock(id, obj)
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
    transaction: () => {
      const tx = {
        patch: (id: string) => {
          txPatchIds.push(id)
          return tx
        },
        commit: () => txCommitMock(),
      }
      return tx
    },
  },
}))

// External boundary: the current-domain conference resolution reads headers() +
// Sanity. We mock THAT (not the internal `@/lib/organization/sanity`) and let
// the real `getOrganizationRefForCurrentConference` run on top of it — it reads
// `.organization._ref` off whatever conference this returns.
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import {
  getSponsorEmailTemplates,
  getSponsorEmailTemplate,
  updateSponsorEmailTemplate,
  deleteSponsorEmailTemplate,
  setDefaultSponsorEmailTemplate,
  reorderSponsorEmailTemplates,
} from './sanity'

// Resolve the current tenant to `orgId`, or to no organization (null) to
// exercise the fail-closed paths.
function setCurrentOrg(orgId: string | null) {
  getConferenceMock.mockResolvedValue({
    conference: orgId
      ? { organization: { _ref: orgId } }
      : { organization: null },
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  txPatchIds.length = 0
  setCurrentOrg('org-A') // current tenant = org A
})

describe('sponsor email templates — read scoping (#19)', () => {
  it('lists only the current org’s templates', async () => {
    const { templates } = await getSponsorEmailTemplates()
    expect(templates?.map((t) => t._id)).toEqual(['t-A'])
    expect(templates?.some((t) => t._id === 't-B')).toBe(false)
  })

  it('returns undefined for a foreign org’s template by id', async () => {
    const { template } = await getSponsorEmailTemplate('t-B')
    expect(template).toBeUndefined()
  })

  it('returns the own org’s template by id', async () => {
    const { template } = await getSponsorEmailTemplate('t-A')
    expect(template).toBeTruthy()
  })

  it('scopes the other direction too (org B cannot read org A)', async () => {
    setCurrentOrg('org-B')
    expect((await getSponsorEmailTemplate('t-A')).template).toBeUndefined()
    expect((await getSponsorEmailTemplate('t-B')).template).toBeTruthy()
  })
})

describe('sponsor email templates — mutation deny (#19)', () => {
  it('set-default on a foreign template is rejected with no write', async () => {
    const { error } = await setDefaultSponsorEmailTemplate('t-B')
    expect(error).toBeTruthy()
    expect(txCommitMock).not.toHaveBeenCalled()
  })

  it('set-default on the own template commits', async () => {
    const { error } = await setDefaultSponsorEmailTemplate('t-A')
    expect(error).toBeUndefined()
    expect(txCommitMock).toHaveBeenCalledTimes(1)
    expect(txPatchIds).toContain('t-A')
  })

  it('reorder including a foreign template is rejected with no write', async () => {
    const { error } = await reorderSponsorEmailTemplates(['t-A', 't-B'])
    expect(error).toBeTruthy()
    expect(txCommitMock).not.toHaveBeenCalled()
  })

  it('update of a foreign template is rejected with no patch', async () => {
    const { error } = await updateSponsorEmailTemplate('t-B', {
      title: 'hijack',
    })
    expect(error).toBeTruthy()
    expect(patchSetMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('update of the own template patches and commits', async () => {
    const { error } = await updateSponsorEmailTemplate('t-A', { title: 'ok' })
    expect(error).toBeUndefined()
    expect(patchSetMock).toHaveBeenCalledWith('t-A', { title: 'ok' })
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('delete of a foreign template is rejected with no delete', async () => {
    const { error } = await deleteSponsorEmailTemplate('t-B')
    expect(error).toBeTruthy()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('delete of the own template deletes', async () => {
    const { error } = await deleteSponsorEmailTemplate('t-A')
    expect(error).toBeUndefined()
    expect(deleteMock).toHaveBeenCalledWith('t-A')
  })
})

describe('sponsor email templates — fail closed when tenant is unresolvable (#19)', () => {
  beforeEach(() => {
    setCurrentOrg(null) // tenant cannot be resolved → must NOT read/write globally
  })

  it('list returns empty and issues NO query', async () => {
    const { templates } = await getSponsorEmailTemplates()
    expect(templates).toEqual([])
    // The guard must bite: reverting it would issue an unscoped read of both orgs.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('read by id returns undefined and issues NO query', async () => {
    const { template } = await getSponsorEmailTemplate('t-A')
    expect(template).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('update is rejected with no read and no write', async () => {
    const { error } = await updateSponsorEmailTemplate('t-A', { title: 'x' })
    expect(error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(patchSetMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('delete is rejected with no read and no delete', async () => {
    const { error } = await deleteSponsorEmailTemplate('t-A')
    expect(error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('set-default is rejected with no read and no write', async () => {
    const { error } = await setDefaultSponsorEmailTemplate('t-A')
    expect(error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(txCommitMock).not.toHaveBeenCalled()
  })

  it('reorder is rejected with no read and no write', async () => {
    const { error } = await reorderSponsorEmailTemplates(['t-A', 't-B'])
    expect(error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(txCommitMock).not.toHaveBeenCalled()
  })
})
