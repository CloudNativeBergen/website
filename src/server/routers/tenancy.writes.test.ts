/**
 * @vitest-environment node
 *
 * CROSS-TENANT WRITE ISOLATION for the admin mutations that take a document id
 * from CLIENT INPUT (#730).
 *
 * `adminProcedure` proves the caller organizes the REQUEST's org. It says
 * nothing about the id in the payload. Before this change `topic.update`,
 * `topic.delete`, `staff.update`, `staff.delete`, `speaker.admin.update`,
 * `speaker.admin.delete`, `speaker.admin.merge` and `speaker.admin.updateEmail`
 * patched or deleted whatever id they were handed — with no tenant check and no
 * `_type` check, so an organizer of tenant A could retitle or delete tenant B's
 * `conference` document.
 *
 * These tests run the REAL routers through the REAL authz waist and the REAL
 * `src/server/tenancy.ts` guards; only the Sanity clients are faked, by a small
 * document store. That means the assertions are behavioural — "no write reached
 * Sanity" — rather than string checks on a query.
 *
 * TRIPWIRE (see the last describe block): the fake `clientWrite` records whether
 * the ownership probe ran before each write, and an `afterEach` fails ANY test
 * whose writes were unguarded. A future mutation added to these routers without
 * an ownership check therefore fails this suite as soon as it is exercised,
 * rather than depending on someone noticing it in review. A second tripwire pins
 * the SET of mutations each router exposes, so adding one is a deliberate act.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  /** Every document the fake dataset holds, by `_id`. */
  docs: new Map<string, Record<string, unknown>>(),
  /** Writes that reached Sanity, with whether the ownership probe ran first. */
  writes: [] as { op: string; id: string; guarded: boolean }[],
  /** How many times the ownership probe has queried, this test. */
  probes: 0,
  /** How many documents OUTSIDE the request org reference the id under test. */
  foreignReferencingDocs: 0,
  updateSpeaker: vi.fn(),
  getSpeaker: vi.fn(),
  mergeSpeakers: vi.fn(),
  updateProfileEmail: vi.fn(),
  updateProposal: vi.fn(),
  createProposal: vi.fn(),
  deleteProposal: vi.fn(),
  syncParticipants: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
  getConferenceForDomain: h.getConference,
}))

/**
 * A fake Sanity dataset. `fetch` answers by recognising the handful of queries
 * these paths emit; the two OWNERSHIP probes bump `h.probes` so the tripwire can
 * tell a guarded write from an unguarded one.
 */
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params: Record<string, unknown> = {}) => {
    // The ownership probe from `getDocumentTenant`.
    if (query.includes('"memberOrgIds"')) {
      h.probes++
      const doc = h.docs.get(String(params.id))
      if (!doc) return null
      return {
        _type: doc._type,
        orgId:
          (doc.organization as { _ref?: string } | undefined)?._ref ?? null,
        conferenceOrgId: null,
        memberOrgIds: (
          (doc.organizations as { _ref: string }[] | undefined) ?? []
        ).map((o) => o._ref),
      }
    }
    // The participation half of the speaker rule: which orgs own a conference
    // hosting a talk by this person. Derived from the fake dataset's talks so a
    // test can make participation real rather than asserted.
    if (query.includes('references($speakerId)')) {
      h.probes++
      const speakerId = String(params.speakerId)
      const orgIds = new Set<string>()
      for (const doc of h.docs.values()) {
        if (doc._type !== 'talk') continue
        const refs = (doc.speakers as { _ref: string }[] | undefined) ?? []
        if (!refs.some((r) => r._ref === speakerId)) continue
        const org = (doc as { organization?: { _ref?: string } }).organization
          ?._ref
        if (org) orgIds.add(org)
      }
      return Array.from(orgIds)
    }
    // The reference-graph half of the exclusivity check.
    if (query.includes('references($id) && _id != $id')) {
      h.probes++
      return h.foreignReferencingDocs
    }
    // The plural speaker reference-injection guard.
    if (query.includes('_id in $ids && _type == "speaker"')) {
      h.probes++
      const ids = (params.ids as string[]) ?? []
      return ids.filter((id) => {
        const doc = h.docs.get(id)
        if (!doc || doc._type !== 'speaker') return false
        const orgs = (doc.organizations as { _ref: string }[] | undefined) ?? []
        if (orgs.some((o) => o._ref === String(params.orgId))) return true
        // participation fallback, same terms as the singular guard
        for (const other of h.docs.values()) {
          if (other._type !== 'talk') continue
          const refs = (other.speakers as { _ref: string }[] | undefined) ?? []
          const org = (other as { organization?: { _ref?: string } })
            .organization?._ref
          if (refs.some((r) => r._ref === id) && org === params.orgId) {
            return true
          }
        }
        return false
      }).length
    }
    // The plural ORG-DOCUMENT reference-injection guard (`topics[]`, #731 N2).
    if (query.includes('_id in $ids && _type == $expectedType')) {
      h.probes++
      const ids = (params.ids as string[]) ?? []
      return ids.filter((id) => {
        const doc = h.docs.get(id)
        if (!doc || doc._type !== params.expectedType) return false
        return (
          (doc.organization as { _ref?: string } | undefined)?._ref ===
          params.orgId
        )
      }).length
    }
    // The grandfathering read behind the `topics[]` guard: the ids ALREADY on
    // the talk, which may be re-sent unchecked.
    if (query.includes('.topics[]._ref')) {
      const doc = h.docs.get(String(params.id))
      if (!doc || doc._type !== 'talk') return null
      return ((doc.topics as { _ref: string }[] | undefined) ?? []).map(
        (t) => t._ref,
      )
    }
    // `deleteAttachmentHelper`'s own by-id read. Answered from the fake dataset
    // so that REMOVING the guard would let the mutation proceed to a write —
    // otherwise the helper's own NOT_FOUND would mask a missing guard.
    if (query.includes('_type == "talk" && _id == $id')) {
      const doc = h.docs.get(String(params.id))
      if (!doc || doc._type !== 'talk') return null
      return { _id: params.id, attachments: doc.attachments ?? [] }
    }
    // `topic.delete`'s reference guard, and `topic.create`'s slug probe.
    if (query.includes('references($id)')) return 0
    if (query.includes('slug.current == $slug')) return null
    return null
  }
  const record = (op: string, id: string) => {
    h.writes.push({ op, id, guarded: h.probes > 0 })
  }
  const patchChain = (id: string) => {
    record('patch', id)
    const chain = {
      set: () => chain,
      unset: () => chain,
      setIfMissing: () => chain,
      insert: () => chain,
      commit: async () => ({ _id: id }),
    }
    return chain
  }
  const client = {
    fetch,
    // Same reasoning as the `talk` branch of `fetch`: a real document here means
    // a deleted guard reaches the patch, so the mutation test can see it.
    getDocument: async (id: string) => {
      const doc = h.docs.get(id)
      return doc ? { _id: id, ...doc } : null
    },
    create: async (doc: Record<string, unknown>) => {
      record('create', String(doc._type))
      return { _id: 'created-1', ...doc }
    },
    patch: patchChain,
    delete: async (id: string) => {
      record('delete', id)
      return { results: [] }
    },
    assets: { upload: vi.fn() },
  }
  return {
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
    sanityImage: () => ({ url: () => '' }),
    speakerImageUrl: () => '',
  }
})

vi.mock('@/lib/speaker/sanity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    getSpeaker: h.getSpeaker,
    updateSpeaker: h.updateSpeaker,
    generateUniqueSlug: async (name: string) => name.toLowerCase(),
  }
})
vi.mock('@/lib/speaker/merge', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, mergeSpeakers: h.mergeSpeakers }
})
vi.mock('@/lib/profile/sanity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, updateProfileEmail: h.updateProfileEmail }
})
vi.mock('@/lib/proposal/data/sanity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    updateProposal: h.updateProposal,
    createProposal: h.createProposal,
    deleteProposal: h.deleteProposal,
  }
})
vi.mock('@/lib/messaging/sanity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    syncProposalConversationParticipants: h.syncParticipants,
  }
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { topicRouter } from './topic'
import { staffRouter } from './staff'
import { speakerRouter } from './speaker'
import { proposalRouter } from './proposal'

const t = initTRPC.context<Context>().create()
const callTopic = t.createCallerFactory(topicRouter)
const callStaff = t.createCallerFactory(staffRouter)
const callSpeaker = t.createCallerFactory(speakerRouter)
const callProposal = t.createCallerFactory(proposalRouter)

const ORG_A = 'org-A'
const ORG_B = 'org-B'

/** A caller who is an organizer of ORG_A — the request org in every test. */
function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const topic = () => callTopic(ctx())
const staff = () => callStaff(ctx())
const speaker = () => callSpeaker(ctx())
const proposal = () => callProposal(ctx())

/** The request host resolves to a conference owned by `orgId` (or to nothing). */
function host(orgId: string | null) {
  h.getConference.mockResolvedValue({
    conference: orgId
      ? { _id: 'conf-A', organization: { _ref: orgId } }
      : ({} as Record<string, unknown>),
    domain: 'localhost',
    error: orgId ? null : new Error('Conference not found for domain'),
  })
}

function seed() {
  h.docs.clear()
  // ORG_A's own documents — the single-tenant present.
  h.docs.set('topic-A', { _type: 'topic', organization: { _ref: ORG_A } })
  h.docs.set('staff-A', { _type: 'staff', organization: { _ref: ORG_A } })
  h.docs.set('speaker-A', {
    _type: 'speaker',
    organizations: [{ _ref: ORG_A }],
  })
  h.docs.set('speaker-A2', {
    _type: 'speaker',
    organizations: [{ _ref: ORG_A }],
  })
  // ANOTHER tenant's documents.
  h.docs.set('topic-B', { _type: 'topic', organization: { _ref: ORG_B } })
  h.docs.set('staff-B', { _type: 'staff', organization: { _ref: ORG_B } })
  h.docs.set('speaker-B', {
    _type: 'speaker',
    organizations: [{ _ref: ORG_B }],
  })
  // The worst case in #730: a CONFERENCE document reached through a topic or
  // staff endpoint. `patch.set` does not care about `_type`.
  h.docs.set('conf-B', { _type: 'conference', organization: { _ref: ORG_B } })
  h.docs.set('conf-A', { _type: 'conference', organization: { _ref: ORG_A } })
  // Owned by nobody — an unowned document belongs to no tenant.
  h.docs.set('topic-orphan', { _type: 'topic' })
  // A person who belongs to BOTH tenants.
  h.docs.set('speaker-shared', {
    _type: 'speaker',
    organizations: [{ _ref: ORG_A }, { _ref: ORG_B }],
  })
  // #731 F2: a person with a TALK at ORG_B but NO membership anywhere — the
  // population `ensureSpeakerOrgMembership`'s swallowed failures and the
  // pre-044 dataset produce. Exclusivity used to ignore them entirely.
  h.docs.set('speaker-B-participant', { _type: 'speaker', organizations: [] })
  h.docs.set('talk-B', {
    _type: 'talk',
    organization: { _ref: ORG_B },
    speakers: [{ _ref: 'speaker-B-participant' }],
    attachments: [{ _key: 'k', _type: 'urlAttachment' }],
  })
  // ORG_A's own talk, for the proposal reference-injection tests. It carries a
  // LEGACY org-less topic so the grandfathering path is exercised: re-saving
  // that id must keep working, adding a foreign one must not.
  h.docs.set('talk-A', {
    _type: 'talk',
    organization: { _ref: ORG_A },
    speakers: [{ _ref: 'speaker-A' }],
    topics: [{ _ref: 'topic-A' }, { _ref: 'topic-orphan' }],
    attachments: [{ _key: 'k', _type: 'urlAttachment' }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writes.length = 0
  h.probes = 0
  h.foreignReferencingDocs = 0
  seed()
  host(ORG_A)
  h.getSpeaker.mockResolvedValue({ speaker: { _id: 'speaker-A' }, err: null })
  h.updateSpeaker.mockImplementation(async (id: string) => {
    h.writes.push({ op: 'updateSpeaker', id, guarded: h.probes > 0 })
    return { speaker: { _id: id }, err: null }
  })
  h.updateProfileEmail.mockImplementation(
    async (_email: string, id: string) => {
      h.writes.push({ op: 'updateProfileEmail', id, guarded: h.probes > 0 })
      return { error: null }
    },
  )
  h.updateProposal.mockImplementation(async (id: string) => {
    h.writes.push({ op: 'updateProposal', id, guarded: h.probes > 0 })
    return { proposal: { _id: id }, err: null }
  })
  h.createProposal.mockImplementation(async () => {
    h.writes.push({ op: 'createProposal', id: 'new', guarded: h.probes > 0 })
    return { proposal: { _id: 'new' }, err: null }
  })
  h.deleteProposal.mockImplementation(async (id: string) => {
    h.writes.push({ op: 'deleteProposal', id, guarded: h.probes > 0 })
    return { err: null }
  })
  h.syncParticipants.mockResolvedValue(undefined)
  h.mergeSpeakers.mockImplementation(async (args: { loserId: string }) => {
    h.writes.push({ op: 'merge', id: args.loserId, guarded: h.probes > 0 })
    return { preview: {}, committed: true, err: null }
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/**
 * THE TRIPWIRE. Every write that reached Sanity in any test above must have been
 * preceded by an ownership probe. A new mutation added to these routers without
 * a `require*InCurrentOrg` guard fails here the moment a test touches it — no
 * reviewer has to spot it.
 */
afterEach(() => {
  const unguarded = h.writes.filter((w) => !w.guarded && w.op !== 'create')
  expect(unguarded, 'a write bypassed the ownership guard').toEqual([])
})

describe('topic mutations refuse a foreign or wrong-typed id (#730)', () => {
  it('update: another tenant’s topic is NOT_FOUND and nothing is written', async () => {
    await expect(
      topic().update({ id: 'topic-B', title: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: another tenant’s CONFERENCE document is refused', async () => {
    await expect(
      topic().update({ id: 'conf-B', title: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: OWN-tenant conference document is refused too — wrong `_type`', async () => {
    await expect(
      topic().update({ id: 'conf-A', title: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: an unowned (org-less) topic is refused — fail closed', async () => {
    await expect(
      topic().update({ id: 'topic-orphan', title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: a missing id is refused — fail closed', async () => {
    await expect(
      topic().update({ id: 'nope', title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('delete: another tenant’s topic is refused BEFORE the reference guard', async () => {
    await expect(topic().delete({ id: 'topic-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.writes).toEqual([])
  })

  it('delete: another tenant’s conference document is refused', async () => {
    await expect(topic().delete({ id: 'conf-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.writes).toEqual([])
  })

  it('the caller’s OWN topic still updates and deletes (behaviour unchanged)', async () => {
    await expect(
      topic().update({ id: 'topic-A', title: 'Renamed' }),
    ).resolves.toEqual({ success: true })
    await expect(topic().delete({ id: 'topic-A' })).resolves.toEqual({
      success: true,
    })
    expect(h.writes.map((w) => w.op)).toEqual(['patch', 'delete'])
  })
})

describe('staff mutations refuse a foreign or wrong-typed id (#730)', () => {
  it('update: another tenant’s staff member is refused', async () => {
    await expect(
      staff().update({ id: 'staff-B', name: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: another tenant’s CONFERENCE document is refused', async () => {
    await expect(
      staff().update({ id: 'conf-B', name: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: a topic id is refused through the staff endpoint — wrong `_type`', async () => {
    await expect(
      staff().update({ id: 'topic-A', name: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('delete: another tenant’s staff member is refused', async () => {
    await expect(staff().delete({ id: 'staff-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.writes).toEqual([])
  })

  it('the refusal is NOT_FOUND, not a masked 500', async () => {
    await expect(staff().delete({ id: 'staff-B' })).rejects.not.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('the caller’s OWN staff member still updates and deletes', async () => {
    await expect(
      staff().update({ id: 'staff-A', name: 'Renamed' }),
    ).resolves.toEqual({ success: true })
    await expect(staff().delete({ id: 'staff-A' })).resolves.toEqual({
      success: true,
    })
    expect(h.writes.map((w) => w.op)).toEqual(['patch', 'delete'])
  })
})

describe('speaker admin mutations refuse a foreign id (#730)', () => {
  it('update: another tenant’s speaker is refused', async () => {
    await expect(
      speaker().admin.update({ id: 'speaker-B', data: { name: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('update: a non-speaker document is refused — wrong `_type`', async () => {
    await expect(
      speaker().admin.update({ id: 'conf-A', data: { name: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('delete: another tenant’s speaker is refused', async () => {
    await expect(
      speaker().admin.delete({ id: 'speaker-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('delete: a SHARED person is refused — deleting them would hit the other tenant', async () => {
    await expect(
      speaker().admin.delete({ id: 'speaker-shared' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.writes).toEqual([])
  })

  it('updateEmail: another tenant’s speaker is refused', async () => {
    await expect(
      speaker().admin.updateEmail({ id: 'speaker-B', email: 'x@example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('merge: a foreign survivor or loser is refused, and nothing merges', async () => {
    await expect(
      speaker().admin.merge({ survivorId: 'speaker-A', loserId: 'speaker-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      speaker().admin.merge({ survivorId: 'speaker-B', loserId: 'speaker-A' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('mergePreview: refused on the same terms as the mutation', async () => {
    await expect(
      speaker().admin.mergePreview({
        survivorId: 'speaker-A',
        loserId: 'speaker-B',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.mergeSpeakers).not.toHaveBeenCalled()
  })

  it('the caller’s OWN speaker still updates, merges and deletes', async () => {
    await expect(
      speaker().admin.update({ id: 'speaker-A', data: { name: 'Renamed' } }),
    ).resolves.toBeTruthy()
    await expect(
      speaker().admin.merge({ survivorId: 'speaker-A', loserId: 'speaker-A2' }),
    ).resolves.toMatchObject({ success: true })
    await expect(speaker().admin.delete({ id: 'speaker-A' })).resolves.toEqual({
      success: true,
    })
    expect(h.writes.map((w) => w.op)).toEqual([
      'updateSpeaker',
      'merge',
      'delete',
    ])
  })
})

/**
 * #731 F1/F2 — the exploit chain the guard layer did NOT stop.
 *
 * `requireSpeakerInCurrentOrg` grants ownership by MEMBERSHIP OR PARTICIPATION,
 * and participation was CLIENT-WRITABLE: `proposal.admin.update` wrote
 * `speakers[]` from raw strings and only proved the TALK was yours. Attach
 * tenant B's speaker to your own talk → you now "own" them → rewrite their name,
 * slug, bio and GDPR consent, or merge them away, which repoints B's talks onto
 * your speaker and deletes the person.
 *
 * An ownership predicate must not be satisfiable by an action the attacker
 * controls, so the reference write is now guarded on the SAME terms as the
 * ownership check it feeds.
 */
describe('speaker ownership cannot be self-granted (#731 F1)', () => {
  it('proposal.admin.update refuses a foreign speaker id in speakers[]', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { speakers: ['speaker-B'] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
    expect(h.syncParticipants).not.toHaveBeenCalled()
  })

  it('…including when mixed with an OWN speaker — all or nothing', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { speakers: ['speaker-A', 'speaker-B'] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('proposal.admin.update still accepts our OWN speakers', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { speakers: ['speaker-A', 'speaker-A2'] },
      }),
    ).resolves.toBeTruthy()
    expect(h.updateProposal).toHaveBeenCalled()
  })

  it('proposal.admin.create refuses a foreign speaker id too', async () => {
    await expect(
      proposal().admin.create({
        title: 'T',
        description: [{ _type: 'block', children: [] }],
        format: 'lightning_10',
        level: 'beginner',
        language: 'english',
        audiences: ['developer'],
        topics: [{ _type: 'reference', _ref: 'topic-A' }],
        tos: true,
        speakers: ['speaker-B'],
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.createProposal).not.toHaveBeenCalled()
  })

  it('the whole chain: no foreign talk attachment means no ownership of the person', async () => {
    // Step 2 of the exploit is refused, so step 4 stays refused as well — the
    // foreign speaker never becomes editable through this org.
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { speakers: ['speaker-B'] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      speaker().admin.update({ id: 'speaker-B', data: { name: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })
})

/**
 * #731 N2. `talk.topics[]` is `z.array(ReferenceSchema)` written verbatim by a
 * bare `.patch().set()`, so it was the same reference-injection shape the PR
 * fixed one level up at `conference.updateTopics` — and reachable by any
 * authenticated speaker, not just an organizer. Impact is display pollution
 * (another tenant's taxonomy title and brand colour on this programme), not
 * privilege, but it is the same class.
 */
describe('talk.topics[] refuses a foreign or wrong-typed reference (#731 N2)', () => {
  const ref = (id: string) => ({ _type: 'reference' as const, _ref: id })

  it('admin.update refuses another tenant’s topic', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { topics: [ref('topic-A'), ref('topic-B')] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('admin.update refuses a NON-topic document of our own org', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { topics: [ref('conf-A')] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('admin.update accepts our own topics', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { topics: [ref('topic-A')] },
      }),
    ).resolves.toBeTruthy()
    expect(h.updateProposal).toHaveBeenCalled()
  })

  it('GRANDFATHERING: an org-less topic already on the talk may be re-sent', async () => {
    // A legacy (pre-044) topic reference must not brick every save of an old
    // talk — it is already referenced, so re-sending it injects nothing.
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { topics: [ref('topic-A'), ref('topic-orphan')] },
      }),
    ).resolves.toBeTruthy()
    expect(h.updateProposal).toHaveBeenCalled()
  })

  it('…but a grandfathered id cannot be used to smuggle a NEW foreign one', async () => {
    await expect(
      proposal().admin.update({
        id: 'talk-A',
        data: { topics: [ref('topic-orphan'), ref('topic-B')] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('admin.create refuses a foreign topic (nothing is grandfathered)', async () => {
    await expect(
      proposal().admin.create({
        title: 'T',
        description: [{ _type: 'block', children: [] }],
        format: 'lightning_10',
        level: 'beginner',
        language: 'english',
        audiences: ['developer'],
        topics: [ref('topic-B')],
        tos: true,
        speakers: ['speaker-A'],
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.createProposal).not.toHaveBeenCalled()
  })
})

/**
 * #731 F10. Every one of `proposal.admin.*`'s five guards survived the review's
 * mutation test — they could all be deleted with the suite green. One
 * NOT_FOUND-on-foreign-id test per guard, each asserting no write reached the
 * data layer.
 */
describe('proposal admin mutations refuse a foreign or wrong-typed id (#730)', () => {
  it('update: another tenant’s talk is refused', async () => {
    await expect(
      proposal().admin.update({ id: 'talk-B', data: { title: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('update: a non-talk document of our OWN org is refused — wrong `_type`', async () => {
    await expect(
      proposal().admin.update({ id: 'conf-A', data: { title: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('delete: another tenant’s talk is refused', async () => {
    await expect(
      proposal().admin.delete({ id: 'talk-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.deleteProposal).not.toHaveBeenCalled()
  })

  it('updateAudienceFeedback: another tenant’s talk is refused', async () => {
    await expect(
      proposal().admin.updateAudienceFeedback({
        id: 'talk-B',
        feedback: { greenCount: 1, yellowCount: 0, redCount: 0 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.writes).toEqual([])
  })

  it('updateAttachments: another tenant’s talk is refused', async () => {
    await expect(
      proposal().admin.updateAttachments({ id: 'talk-B', attachments: [] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('deleteAttachment: another tenant’s talk is refused', async () => {
    await expect(
      proposal().admin.deleteAttachment({ id: 'talk-B', attachmentKey: 'k' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // `talk-B` really does carry attachment `k` in the fake dataset, so without
    // the guard this reaches `updateProposal`.
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('the caller’s OWN talk still updates and deletes', async () => {
    await expect(
      proposal().admin.update({ id: 'talk-A', data: { title: 'Renamed' } }),
    ).resolves.toBeTruthy()
    await expect(
      proposal().admin.delete({ id: 'talk-A' }),
    ).resolves.toBeTruthy()
    expect(h.updateProposal).toHaveBeenCalled()
    expect(h.deleteProposal).toHaveBeenCalledWith('talk-A')
  })
})

describe('destructive speaker ops see participation, not just membership (#731 F2)', () => {
  it('merge refuses a loser with a talk at another tenant and NO membership there', async () => {
    // `speaker-B-participant` has `organizations: []`, so the old
    // membership-only exclusivity check passed them — and the merge would have
    // repointed ORG_B's talk onto ORG_A's speaker and deleted the person.
    await expect(
      speaker().admin.merge({
        survivorId: 'speaker-A',
        loserId: 'speaker-B-participant',
      }),
    ).rejects.toBeTruthy()
    expect(h.mergeSpeakers).not.toHaveBeenCalled()
    expect(h.writes).toEqual([])
  })

  it('delete refuses that same person', async () => {
    await expect(
      speaker().admin.delete({ id: 'speaker-B-participant' }),
    ).rejects.toBeTruthy()
    expect(h.writes).toEqual([])
  })

  it('merge refuses when another tenant’s document still references the loser', async () => {
    h.foreignReferencingDocs = 1
    await expect(
      speaker().admin.merge({ survivorId: 'speaker-A', loserId: 'speaker-A2' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.mergeSpeakers).not.toHaveBeenCalled()
  })

  it('mergePreview refuses on exactly the same terms', async () => {
    await expect(
      speaker().admin.mergePreview({
        survivorId: 'speaker-A',
        loserId: 'speaker-B-participant',
      }),
    ).rejects.toBeTruthy()
    expect(h.mergeSpeakers).not.toHaveBeenCalled()
  })

  it('mergePreview refuses a foreign SURVIVOR', async () => {
    // The survivor arm has its own guard; a refactor deleting it must fail here.
    await expect(
      speaker().admin.mergePreview({
        survivorId: 'speaker-B',
        loserId: 'speaker-A',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.mergeSpeakers).not.toHaveBeenCalled()
  })
})

describe('an unresolvable host writes nothing at all (#730)', () => {
  beforeEach(() => host(null))

  it('every guarded mutation refuses before touching Sanity', async () => {
    // The authz waist denies first on an unresolvable org; the ownership guard
    // is the second line. Either way NOTHING may be written.
    await expect(
      topic().update({ id: 'topic-A', title: 'x' }),
    ).rejects.toBeTruthy()
    await expect(topic().delete({ id: 'topic-A' })).rejects.toBeTruthy()
    await expect(
      staff().update({ id: 'staff-A', name: 'x' }),
    ).rejects.toBeTruthy()
    await expect(staff().delete({ id: 'staff-A' })).rejects.toBeTruthy()
    await expect(
      speaker().admin.update({ id: 'speaker-A', data: { name: 'x' } }),
    ).rejects.toBeTruthy()
    await expect(
      speaker().admin.delete({ id: 'speaker-A' }),
    ).rejects.toBeTruthy()
    expect(h.writes).toEqual([])
  })

  it('creates refuse too, rather than stranding an unowned document', async () => {
    await expect(topic().create({ title: 'x' })).rejects.toBeTruthy()
    await expect(
      staff().create({ name: 'x', role: 'r', link: 'https://e.example.com' }),
    ).rejects.toBeTruthy()
    expect(h.writes).toEqual([])
  })
})

/**
 * SURFACE TRIPWIRE. Pins the set of mutations each of these routers exposes. If
 * a new one is added, this fails — forcing whoever adds it to decide, explicitly,
 * whether its id comes from client input and therefore needs an ownership guard
 * plus a refusal test above.
 */
describe('the guarded mutation surface is pinned (#730)', () => {
  function mutationPaths(router: unknown) {
    const procedures = (
      router as {
        _def: { procedures: Record<string, { _def?: { type?: string } }> }
      }
    )._def.procedures
    return Object.entries(procedures)
      .filter(([, p]) => p._def?.type === 'mutation')
      .map(([path]) => path)
      .sort()
  }

  it('topic', () => {
    expect(mutationPaths(topicRouter)).toEqual(['create', 'delete', 'update'])
  })

  it('staff', () => {
    expect(mutationPaths(staffRouter)).toEqual(['create', 'delete', 'update'])
  })

  it('speaker', () => {
    expect(mutationPaths(speakerRouter)).toEqual([
      'admin.broadcastEmail',
      'admin.create',
      'admin.delete',
      'admin.merge',
      'admin.sendEmail',
      'admin.syncAudience',
      'admin.update',
      'admin.updateEmail',
      'generateCliToken',
      'setMessagingEmailDefault',
      'update',
      'updateEmail',
    ])
  })
})
