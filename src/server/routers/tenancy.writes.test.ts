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
  updateSpeaker: vi.fn(),
  getSpeaker: vi.fn(),
  mergeSpeakers: vi.fn(),
  updateProfileEmail: vi.fn(),
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
    // The participation half of the speaker rule.
    if (query.includes('references($speakerId)')) {
      h.probes++
      return 0
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { topicRouter } from './topic'
import { staffRouter } from './staff'
import { speakerRouter } from './speaker'

const t = initTRPC.context<Context>().create()
const callTopic = t.createCallerFactory(topicRouter)
const callStaff = t.createCallerFactory(staffRouter)
const callSpeaker = t.createCallerFactory(speakerRouter)

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
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writes.length = 0
  h.probes = 0
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
