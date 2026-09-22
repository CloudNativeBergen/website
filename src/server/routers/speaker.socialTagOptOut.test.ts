/**
 * @vitest-environment node
 *
 * "Don't tag me in social posts" — the speaker opt-out (#1148,
 * `docs/MARKETING_TAGGING_SPEC.md` §3.2), end to end through the tRPC routers.
 *
 * NOTHING IS MOCKED BETWEEN THE CALLER AND THE STORED DOCUMENT. Reads run
 * `groq-js` over a real dataset; writes build a REAL `@sanity/client` patch
 * whose commit is applied to that dataset by Sanity's own `@sanity/mutator`.
 * So every assertion below is on the VALUE Sanity would hold afterwards, which
 * is the only thing that can catch this field's two silent failure modes:
 *
 *  - the speaker input schema STRIPS keys it does not name, so a form field
 *    the schema forgot is dropped without an error — a test that asserts "no
 *    error" or "the key is absent" passes either way;
 *  - a patch mock records the call you made, not the document Sanity would end
 *    up with, so `setIfMissing` semantics can only be proved against the real
 *    mutator.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  commits: 0,
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { parse, evaluate } = await import('groq-js')
  const { createRequire: req } = await import('node:module')
  const { Mutation } = req(req(import.meta.url).resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }

  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  const fetch = async (query: string, params: Record<string, unknown> = {}) =>
    await (await evaluate(parse(query), { dataset: h.dataset, params })).get()

  return {
    clientReadUncached: { fetch },
    clientReadCached: { fetch },
    clientRead: { fetch },
    clientWrite: {
      fetch,
      // Creates land in the dataset so a read-back sees them, exactly as the
      // router's own post-create `getSpeaker` does.
      create: async (doc: Record<string, unknown>) => {
        const created = {
          ...doc,
          _id: `new-${h.dataset.length}`,
          _rev: 'rev-new',
        }
        h.dataset.push(created)
        return created
      },
      delete: vi.fn(),
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          h.commits += 1
          const index = h.dataset.findIndex((d) => d._id === id)
          if (index === -1) throw new Error(`no such document: ${id}`)
          const next = new Mutation({
            mutations: [{ patch: patch.serialize() }],
          }).apply(structuredClone(h.dataset[index]))
          if (next) h.dataset[index] = next
          return {}
        }) as typeof patch.commit
        return patch
      },
    },
    speakerImageUrl: vi.fn(),
  }
})

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'a.test',
    error: null,
  }),
}))

import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'
import { SpeakerInputSchema } from '@/server/schemas/speaker'
import { updateSpeaker } from '@/lib/speaker/sanity'

const ORG_A = 'org-A'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** The speaker document as Sanity holds it right now. */
const stored = (id = 'spk-1') =>
  h.dataset.find((d) => d._id === id) as Record<string, unknown>

function seed() {
  h.commits = 0
  h.dataset = [
    { _id: ORG_A, _type: 'organization', name: 'A' },
    {
      _id: 'conf-A',
      _type: 'conference',
      organization: ref(ORG_A),
      organizers: [ref('admin-1')],
    },
    {
      _id: 'admin-1',
      _rev: 'rev-admin',
      _type: 'speaker',
      name: 'Olive Organizer',
      email: 'olive@example.com',
      organizations: [ref(ORG_A)],
    },
    {
      _id: 'spk-1',
      _rev: 'rev-1',
      _type: 'speaker',
      name: 'Alice Speaker',
      email: 'alice@example.com',
      bio: 'Original bio',
      links: ['https://bsky.app/profile/alice.dev'],
      organizations: [ref(ORG_A)],
    } satisfies Doc,
  ]
}

function speakerCaller(speakerId = 'spk-1') {
  const speaker = { _id: speakerId, name: 'Alice Speaker', isOrganizer: false }
  return speakerRouter.createCaller({
    session: { speaker, user: { name: 'Alice Speaker' } },
    speaker,
  } as unknown as Context)
}

function organizerCaller() {
  const speaker = {
    _id: 'admin-1',
    name: 'Olive Organizer',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  return speakerRouter.createCaller({
    session: { speaker, user: { name: 'Olive Organizer' } },
    speaker,
  } as unknown as Context)
}

const NOW = '2026-09-22T10:30:00.000Z'

beforeEach(() => {
  seed()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => vi.useRealTimers())

describe('the speaker sets and clears their own opt-out', () => {
  it('SAVES THE VALUE — the input schema names the field, so it is not stripped', async () => {
    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: true,
    })

    // The VALUE in the document, not the absence of an error. Drop
    // `socialTagOptOut` from `SpeakerInputSchema` and Zod strips the key
    // silently: the mutation still commits, the call still succeeds, and only
    // this line goes red.
    expect(stored().socialTagOptOut).toBe(true)
  })

  it('stamps the time SERVER-SIDE and ignores a client-supplied one', async () => {
    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: true,
      // A client that wants the record to say it opted out years ago. Neither
      // the schema nor the writer will take it.
      socialTagOptOutAt: '1999-01-01T00:00:00.000Z',
    } as Parameters<ReturnType<typeof speakerCaller>['update']>[0])

    expect(stored().socialTagOptOutAt).toBe(NOW)
  })

  it('keeps the ORIGINAL timestamp when a later save leaves the opt-out on', async () => {
    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: true,
    })
    expect(stored().socialTagOptOutAt).toBe(NOW)

    vi.setSystemTime(new Date('2026-12-24T09:00:00.000Z'))
    await speakerCaller().update({
      name: 'Alice Renamed',
      socialTagOptOut: true,
    })

    // `setIfMissing`, proved against Sanity's real patch semantics: the field
    // records when the opt-out was MADE, and an unrelated profile save must not
    // restamp it.
    expect(stored().socialTagOptOutAt).toBe(NOW)
    expect(stored().name).toBe('Alice Renamed')
  })

  it('clears both fields when the speaker withdraws it', async () => {
    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: true,
    })

    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: false,
    })

    expect(stored().socialTagOptOut).toBeUndefined()
    expect(stored().socialTagOptOutAt).toBeUndefined()
  })

  it('re-stamps a fresh time after a clear and a second opt-out', async () => {
    await speakerCaller().update({ name: 'A', socialTagOptOut: true })
    await speakerCaller().update({ name: 'A', socialTagOptOut: false })

    vi.setSystemTime(new Date('2027-03-01T08:00:00.000Z'))
    await speakerCaller().update({ name: 'A', socialTagOptOut: true })

    expect(stored().socialTagOptOutAt).toBe('2027-03-01T08:00:00.000Z')
  })

  it('PRESERVES a stored opt-out when the save says nothing about it', async () => {
    // The distinction the whole design rests on: an ABSENT key is "no
    // opinion", only an explicit `false` is a withdrawal. A form fed a speaker
    // from a projection that does not carry the field, or a narrow caller that
    // writes one column, must not silently undo a refusal.
    //
    // This starts from an opted-out document ON PURPOSE. The "off by default"
    // case below starts from a clean one and would pass even if this branch
    // unset the pair.
    await speakerCaller().update({ name: 'Alice', socialTagOptOut: true })

    vi.setSystemTime(new Date('2027-05-05T05:05:05.000Z'))
    await speakerCaller().update({ name: 'Alice Renamed', bio: 'New bio' })

    expect(stored().name).toBe('Alice Renamed')
    expect(stored().socialTagOptOut).toBe(true)
    expect(stored().socialTagOptOutAt).toBe(NOW)
  })

  it('is OFF by default — an ordinary save writes neither field', async () => {
    await speakerCaller().update({ name: 'Alice Speaker', bio: 'New bio' })

    expect(stored().bio).toBe('New bio')
    expect(stored().socialTagOptOut).toBeUndefined()
    expect(stored().socialTagOptOutAt).toBeUndefined()
  })
})

describe('an organizer may SET the opt-out and may never clear it', () => {
  it('sets it on the speaker’s behalf, stamped server-side', async () => {
    await organizerCaller().admin.update({
      id: 'spk-1',
      data: { socialTagOptOut: true },
    })

    expect(stored().socialTagOptOut).toBe(true)
    expect(stored().socialTagOptOutAt).toBe(NOW)
  })

  it('REFUSES to clear one, and leaves the stored value untouched', async () => {
    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: true,
    })
    const commitsBefore = h.commits

    await expect(
      organizerCaller().admin.update({
        id: 'spk-1',
        data: { name: 'Alice Speaker', socialTagOptOut: false },
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: /only the speaker can withdraw/i,
    })

    // The refusal is worth nothing on its own — this is the assertion that
    // matters. Guarded BEFORE the patch is built, so no write happened at all.
    expect(stored().socialTagOptOut).toBe(true)
    expect(stored().socialTagOptOutAt).toBe(NOW)
    expect(h.commits).toBe(commitsBefore)
  })

  it('does not refuse the same call when nothing is opted out — so the refusal above is about the CLEAR, not the caller', async () => {
    // THE CONTROL. Same organizer, same speaker, same `socialTagOptOut: false`,
    // same procedure. The only difference is the stored value. Without this,
    // the test above would pass just as well if `admin.update` refused
    // organizers outright, or refused this speaker, or refused every `false`.
    const result = await organizerCaller().admin.update({
      id: 'spk-1',
      data: { name: 'Alice Renamed', socialTagOptOut: false },
    })

    expect(result.name).toBe('Alice Renamed')
    expect(stored().name).toBe('Alice Renamed')
    // A `false` from an organizer is never WRITTEN either, so a concurrent
    // opt-out cannot be overwritten by a stale admin form.
    expect(stored().socialTagOptOut).toBeUndefined()
  })

  it('PRESERVES a stored opt-out when the organizer save says nothing about it', async () => {
    await speakerCaller().update({ name: 'Alice', socialTagOptOut: true })

    await organizerCaller().admin.update({
      id: 'spk-1',
      data: { name: 'Alice Renamed' },
    })

    expect(stored().name).toBe('Alice Renamed')
    expect(stored().socialTagOptOut).toBe(true)
    expect(stored().socialTagOptOutAt).toBe(NOW)
  })

  it('survives a save that reduces to an EMPTY patch', async () => {
    // `socialTagOptOut: false` on a speaker who is not opted out is the ONLY
    // key in the payload, and it resolves to no operation at all — so the
    // writer commits a patch with an empty `set` and nothing else. Sanity's
    // real patch builder has to accept that rather than throw, or an organizer
    // opening and saving an untouched admin form would see a 500.
    const result = await organizerCaller().admin.update({
      id: 'spk-1',
      data: { socialTagOptOut: false },
    })

    expect(result._id).toBe('spk-1')
    expect(stored().name).toBe('Alice Speaker')
    expect(stored().socialTagOptOut).toBeUndefined()
  })

  it('cannot forge the timestamp either', async () => {
    await organizerCaller().admin.update({
      id: 'spk-1',
      data: {
        socialTagOptOut: true,
        socialTagOptOutAt: '1999-01-01T00:00:00.000Z',
      } as Parameters<
        ReturnType<typeof organizerCaller>['admin']['update']
      >[0]['data'],
    })

    expect(stored().socialTagOptOutAt).toBe(NOW)
  })

  it('still cannot clear it when the SPEAKER set it and the organizer sends nothing else', async () => {
    await organizerCaller().admin.update({
      id: 'spk-1',
      data: { socialTagOptOut: true },
    })

    await expect(
      organizerCaller().admin.update({
        id: 'spk-1',
        data: { socialTagOptOut: false },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(stored().socialTagOptOut).toBe(true)
  })

  it('and the speaker themselves still can', async () => {
    await organizerCaller().admin.update({
      id: 'spk-1',
      data: { socialTagOptOut: true },
    })

    await speakerCaller().update({
      name: 'Alice Speaker',
      socialTagOptOut: false,
    })

    expect(stored().socialTagOptOut).toBeUndefined()
  })
})

describe('creating a speaker with the opt-out already set', () => {
  it('stamps the time server-side, and never accepts one from the caller', async () => {
    const created = await organizerCaller().admin.create({
      name: 'Bo Newcomer',
      email: 'bo@example.com',
      socialTagOptOut: true,
      socialTagOptOutAt: '1999-01-01T00:00:00.000Z',
    } as Parameters<ReturnType<typeof organizerCaller>['admin']['create']>[0])

    expect(stored(created._id).socialTagOptOut).toBe(true)
    expect(stored(created._id).socialTagOptOutAt).toBe(NOW)
  })

  it('writes NEITHER field when the organizer leaves it off', async () => {
    const created = await organizerCaller().admin.create({
      name: 'Cal Newcomer',
      email: 'cal@example.com',
    })

    // Absent already means "not opted out"; an explicit `false` would be a
    // second way to say the same thing for every reader to get wrong.
    expect(stored(created._id).socialTagOptOut).toBeUndefined()
    expect(stored(created._id).socialTagOptOutAt).toBeUndefined()
  })
})

describe('the writer is the boundary, not just the schema', () => {
  it('discards a client timestamp handed STRAIGHT to `updateSpeaker`', async () => {
    // Zod strips the key today, so nothing through the routers can carry it.
    // This calls the writer the way a future caller might — a script, a bus
    // handler, a second router — and pins that the stamp is still the server's.
    await updateSpeaker(
      'spk-1',
      {
        name: 'Alice Speaker',
        socialTagOptOut: true,
        socialTagOptOutAt: '1999-01-01T00:00:00.000Z',
      } as Parameters<typeof updateSpeaker>[1],
      { actor: 'self' },
    )

    expect(stored().socialTagOptOutAt).toBe(NOW)
  })
})

describe('the input schema', () => {
  it('accepts the opt-out and DISCARDS a client-supplied timestamp', () => {
    const parsed = SpeakerInputSchema.parse({
      name: 'Alice',
      socialTagOptOut: true,
      socialTagOptOutAt: '1999-01-01T00:00:00.000Z',
    })

    expect(parsed.socialTagOptOut).toBe(true)
    expect(parsed).not.toHaveProperty('socialTagOptOutAt')
  })
})
