/**
 * @vitest-environment node
 *
 * Speaker erasure scrubs the erased speaker from post variants (#1232) —
 * asserted on the STORED DOCUMENTS. A variant records who it tags in
 * `mentions[]` (speaker ref, handle, DID, name), and a body not yet posted
 * may still carry their tag or plain name.
 *
 * The harness is the one in `erasure.assets.sanity.test.ts`, copied (a
 * `vi.mock` factory cannot be shared): reads run `groq-js` over an in-memory
 * dataset, and the transaction is a REAL `@sanity/client` transaction whose
 * serialized mutations are applied by Sanity's own `@sanity/mutator`. What it
 * MODELS rather than runs is listed there: visibility by API version and
 * perspective, `ifRevisionID` (checked, whole transaction refused), deletes
 * refused while a strong reference remains.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const h = vi.hoisted(() => ({
  dataset: [] as Array<Record<string, unknown> & { _id: string }>,
  /** Asset ids whose direct delete fails, to leave a linked file behind. */
  failFileDelete: new Set<string>(),
  revCounter: 0,
  /** A write landing after the transaction, before the verification. */
  afterCommit: null as null | (() => void),
}))

/** True when some other document holds a STRONG reference to `id`. */
function stronglyReferenced(
  dataset: Array<Record<string, unknown> & { _id: string }>,
  id: string,
): boolean {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk)
    if (typeof value !== 'object' || value === null) return false
    const v = value as Record<string, unknown>
    if (v._ref === id && v._weak !== true && v.weak !== true) return true
    return Object.values(v).some(walk)
  }
  return dataset.some((doc) => doc._id !== id && walk(doc))
}

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
    apiVersion: '2025-02-19',
    useCdn: false,
  })

  const OLD = '2023-05-03' // the clients' own apiVersion
  const knowsReleases = (apiVersion: string) => apiVersion >= '2025-02-19'
  const isVersion = (id: string) => id.startsWith('versions.')

  const visible = (apiVersion: string, perspective: unknown) =>
    h.dataset.filter((d) => {
      if (knowsReleases(apiVersion)) {
        if (perspective === 'raw') return true
        return !isVersion(d._id) && !d._id.startsWith('drafts.')
      }
      return !isVersion(d._id)
    })
  const fetchAt =
    (apiVersion: string) =>
    async (
      query: string,
      params: Record<string, unknown> = {},
      opts: { perspective?: unknown } = {},
    ) =>
      (
        await evaluate(parse(query), {
          dataset: visible(apiVersion, opts.perspective),
          params,
        })
      ).get()
  const reader = {
    fetch: fetchAt(OLD),
    withConfig: (c: { apiVersion: string }) => ({
      fetch: fetchAt(c.apiVersion),
    }),
  }

  type Mut =
    | { patch: { id: string; ifRevisionID?: string } }
    | { delete: { id: string } }

  return {
    clientReadUncached: reader,
    clientReadCached: reader,
    clientWrite: {
      fetch: fetchAt(OLD),
      withConfig: (c: { apiVersion: string }) => ({
        transaction: () => transactionAt(c.apiVersion),
      }),
      transaction: () => transactionAt(OLD),
      delete: async (id: string) => {
        if (h.failFileDelete.has(id)) throw new Error('503: try again')
        if (stronglyReferenced(h.dataset, id)) {
          throw new Error(`409: ${id} is still referenced`)
        }
        h.dataset = h.dataset.filter((d) => d._id !== id)
        return {}
      },
    },
  }

  function transactionAt(apiVersion: string) {
    const tx = client.transaction()
    tx.commit = (async () => {
      const next = structuredClone(h.dataset)
      const rev = `rev-${++h.revCounter}`
      // Modelled, not verified: an empty transaction is treated as refused,
      // so a run that has nothing to write must not send one.
      if (tx.serialize().length === 0) throw new Error('400: empty transaction')
      for (const m of tx.serialize() as Mut[]) {
        const id = 'delete' in m ? m.delete.id : m.patch.id
        if (isVersion(id) && !knowsReleases(apiVersion)) {
          throw new Error(`400: ${id} needs API 2025-02-19 (modelled)`)
        }
      }
      for (const m of tx.serialize() as Mut[]) {
        if ('delete' in m) {
          const i = next.findIndex((d) => d._id === m.delete.id)
          if (i !== -1) next.splice(i, 1)
          continue
        }
        const i = next.findIndex((d) => d._id === m.patch.id)
        if (i === -1) throw new Error(`no such document: ${m.patch.id}`)
        if (m.patch.ifRevisionID && next[i]._rev !== m.patch.ifRevisionID) {
          throw new Error(`409: ${m.patch.id} revision mismatch`)
        }
        const patched = new Mutation({ mutations: [m] }).apply(next[i])
        next[i] = { ...(patched as (typeof next)[number]), _rev: rev }
      }
      for (const m of tx.serialize() as Mut[]) {
        if ('delete' in m && stronglyReferenced(next, m.delete.id)) {
          throw new Error(`409: ${m.delete.id} is still referenced`)
        }
      }
      h.dataset = next
      h.afterCommit?.()
      return { transactionId: rev }
    }) as typeof tx.commit
    return tx
  }
})

import { eraseSpeakerInPlace, verifySpeakerErasure } from './erasure'

const ADA = 'spkada0001'
const BOB = 'spkbob0002'
const ADA_DID = 'did:plc:ada'
const BOB_DID = 'did:plc:bob'

const ref = (id: string, extra: Record<string, unknown> = {}) => ({
  _type: 'reference',
  _ref: id,
  ...extra,
})
const weak = (id: string) => ref(id, { _weak: true })

const doc = (id: string) => h.dataset.find((d) => d._id === id) as Doc

function mention(
  key: string,
  speaker: string,
  handle: string,
  name: string,
  did?: string,
  status = 'tagged',
) {
  return {
    _key: key,
    _type: 'socialPostMention',
    handle,
    ...(did ? { did } : {}),
    speaker: weak(speaker),
    name,
    status,
  }
}
const adaTag = () =>
  mention('m-ada', ADA, 'ada.bsky.social', 'Ada Lovelace', ADA_DID)
const bobTag = () => mention('m-bob', BOB, 'bob.dev', 'Bob Builder', BOB_DID)

function variant(
  id: string,
  status: string,
  body: string,
  extra: Record<string, unknown> = {},
): Doc {
  return {
    _id: id,
    _type: 'socialPostVariant',
    _rev: 'r0',
    post: weak('post-1'),
    conference: ref('conf-a'),
    platform: 'bluesky',
    status,
    body,
    mentions: [adaTag(), bobTag()],
    ...extra,
  }
}

const TAGGED =
  '🎙️ @ada.bsky.social and @bob.dev are speaking. Meet Ada Lovelace!'

function seed() {
  h.revCounter = 0
  h.failFileDelete = new Set()
  h.afterCommit = null
  h.dataset = [
    { _id: 'org-a', _type: 'organization' },
    { _id: 'org-x', _type: 'organization' },
    { _id: 'conf-a', _type: 'conference', organization: ref('org-a') },
    // Last year's edition of the same organization.
    { _id: 'conf-a-2025', _type: 'conference', organization: ref('org-a') },
    // Somebody else's conference.
    { _id: 'conf-x', _type: 'conference', organization: ref('org-x') },
    {
      _id: ADA,
      _type: 'speaker',
      _rev: 'r0',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      slug: { _type: 'slug', current: 'ada' },
      organizations: [ref('org-a', { _key: 'o1' })],
      links: ['https://bsky.app/profile/ada.bsky.social'],
    },
    {
      _id: BOB,
      _type: 'speaker',
      _rev: 'r0',
      name: 'Bob Builder',
      email: 'bob@example.com',
      slug: { _type: 'slug', current: 'bob' },
      organizations: [ref('org-a', { _key: 'o1' })],
    },
    {
      _id: 'talk-ada',
      _type: 'talk',
      conference: ref('conf-a'),
      speakers: [ref(ADA), ref(BOB)],
    },
    { _id: 'post-1', _type: 'socialPost', _rev: 'r0', body: TAGGED },
    variant('var-scheduled', 'scheduled', TAGGED),
    variant('var-published', 'published', TAGGED),
    // A Content Release copy of a draft variant.
    variant('versions.rlaunch.var-draft', 'draft', TAGGED),
  ].map((d) => JSON.parse(JSON.stringify(d)))
}

beforeEach(() => {
  seed()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

/** Every place a stored variant could still hold Ada. */
function adaIn(v: Doc): string[] {
  const found: string[] = []
  const json = JSON.stringify(v.mentions ?? [])
  if (json.includes(ADA)) found.push('ref')
  if (json.includes('Ada Lovelace')) found.push('name')
  if (json.includes('ada.bsky.social')) found.push('handle')
  if (json.includes(ADA_DID)) found.push('did')
  return found
}

describe('speaker erasure scrubs post variants (#1232)', () => {
  it('leaves no variant, in any version, recording her ref, name, handle or DID — and keeps Bob', async () => {
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()

    for (const id of [
      'var-scheduled',
      'var-published',
      'versions.rlaunch.var-draft',
    ]) {
      expect(adaIn(doc(id)), id).toEqual([])
      expect(doc(id).mentions, id).toEqual([bobTag()])
    }
    expect(result.verification?.residual.postVariants).toBe(0)
    expect(result.verification?.clean).toBe(true)
  })

  it('neutralises her tag and plain name in bodies not yet posted, and leaves a posted body as it went out', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    const scrubbed = '🎙️ a speaker and @bob.dev are speaking. Meet a speaker!'
    expect(doc('var-scheduled').body).toBe(scrubbed)
    expect(doc('versions.rlaunch.var-draft').body).toBe(scrubbed)
    expect(doc('var-published').body).toBe(TAGGED)
  })

  it('finds her plain name, typed by hand with no record, in another edition of her organization — and not in a stranger’s conference', async () => {
    const byHand = 'Last year ADA LOVELACE opened the day.'
    h.dataset.push(
      variant('var-2025', 'awaiting-manual', byHand, {
        conference: ref('conf-a-2025'),
        mentions: [],
        attachments: [
          { _key: 'va1', source: 'a1', altOverride: 'Ada Lovelace on stage' },
          { _key: 'va2', source: 'a2', altOverride: 'The venue' },
        ],
      }),
      variant('var-stranger', 'scheduled', byHand, {
        conference: ref('conf-x'),
        mentions: [],
      }),
    )
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()
    expect(doc('var-2025').body).toBe('Last year a speaker opened the day.')
    expect(doc('var-2025').attachments).toEqual([
      { _key: 'va1', source: 'a1', altOverride: 'a speaker on stage' },
      { _key: 'va2', source: 'a2', altOverride: 'The venue' },
    ])
    expect(doc('var-stranger').body).toBe(byHand)
    expect(result.verification?.clean).toBe(true)
  })

  it('finds her account recorded under another reference, in any tenant, by its DID', async () => {
    h.dataset.push(
      variant('var-elsewhere', 'published', 'Hi @ada.example', {
        conference: ref('conf-x'),
        mentions: [
          mention('m-dup', 'spk-merged-away', 'ada.example', 'Ada L.', ADA_DID),
        ],
      }),
    )
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()
    expect(doc('var-elsewhere').mentions).toEqual([])
  })

  it('leaves another person’s handle and a URL alone even where they spell her name', async () => {
    const body = 'Ada\u00a0Lovelace and @ada-l.dev at x.dev/Ada. Ada.'
    h.dataset.push(variant('var-lookalike', 'draft', body, { mentions: [] }))
    doc(ADA).name = 'Ada'
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('var-lookalike').body).toBe(
      'a speaker and @ada-l.dev at x.dev/Ada. a speaker.',
    )
  })

  it('matches her name across any run of whitespace, and the other spellings her records stored', async () => {
    h.dataset.push(
      variant(
        'var-spaced',
        'draft',
        'Meet Ada\u00a0 Lovelace and Countess Ada L.',
        {
          mentions: [
            mention(
              'm-old',
              ADA,
              'ada.bsky.social',
              'Countess Ada L.',
              ADA_DID,
              'unresolved',
            ),
          ],
        },
      ),
    )
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('var-spaced').body).toBe('Meet a speaker and a speaker')
  })

  it('finds a record whose handle was stored with its @', async () => {
    h.dataset.push(
      variant('var-at', 'published', 'x', {
        conference: ref('conf-x'),
        mentions: [mention('m', 'spk-other', '@ada.bsky.social', 'X')],
      }),
    )
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('var-at').mentions).toEqual([])
  })

  describe('review round 1 (Codex)', () => {
    it('keeps a live co-speaker’s record and tag on a team account they share', async () => {
      const team = (key: string, speaker: string, name: string) =>
        mention(key, speaker, 'team.dev', name, 'did:plc:team')
      h.dataset.push(
        variant('var-team', 'scheduled', '@team.dev and @team.dev speak', {
          mentions: [
            team('t-ada', ADA, 'Ada Lovelace'),
            team('t-bob', BOB, 'Bob Builder'),
          ],
        }),
        variant('var-bob-team', 'draft', 'Hear @team.dev', {
          conference: ref('conf-x'),
          mentions: [team('t-bob', BOB, 'Bob Builder')],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err).toBeNull()
      expect(doc('var-team').body).toBe('a speaker and @team.dev speak')
      expect(doc('var-team').mentions).toEqual([
        team('t-bob', BOB, 'Bob Builder'),
      ])
      expect(doc('var-bob-team').body).toBe('Hear @team.dev')
      expect(doc('var-bob-team').mentions).toHaveLength(1)
      expect(result.verification?.clean).toBe(true)
    })

    it('REFUSES while a live variant naming her awaits the publisher’s confirmation (submitted)', async () => {
      h.dataset.push(variant('var-submitted', 'submitted', TAGGED))
      const before = structuredClone(h.dataset)
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err?.message).toMatch(/var-submitted.*submitted/)
      expect(h.dataset).toEqual(before)
    })

    it('a speaker named "Speaker": the placeholder is never scrubbed again, and verification is clean', async () => {
      doc(ADA).name = 'Speaker'
      const first = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-scheduled').body).toBe(
        '🎙️ a speaker and @bob.dev are speaking. Meet a speaker!',
      )
      expect(first.verification?.clean).toBe(true)
    })

    it('leaves a URL whole, query and fragment included', async () => {
      const body =
        'See https://example.test/?name=Ada, https://example.test/#Ada and https://example.test/?q=x+Ada'
      h.dataset.push(variant('var-url', 'draft', body, { mentions: [] }))
      doc(ADA).name = 'Ada'
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-url').body).toBe(body)
    })

    it('scrubs a draft or release copy whatever status it copied, and never waits on one', async () => {
      h.dataset.push(
        variant('drafts.var-published', 'published', TAGGED),
        variant('versions.rlaunch.var-stuck', 'publishing', TAGGED),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err).toBeNull()
      const scrubbed = '🎙️ a speaker and @bob.dev are speaking. Meet a speaker!'
      expect(doc('drafts.var-published').body).toBe(scrubbed)
      expect(doc('versions.rlaunch.var-stuck').body).toBe(scrubbed)
    })

    it('follows her account to a fixed point: another handle and spelling on a record found by DID, and what that handle finds', async () => {
      h.dataset.push(
        variant('var-alias', 'draft', 'Hi @ada.other and A. Lovelace', {
          conference: ref('conf-x'),
          mentions: [
            mention('m1', 'spk-gone-1', 'ada.other', 'A. Lovelace', ADA_DID),
          ],
        }),
        variant('var-alias-2', 'draft', 'Hi @ada.other', {
          conference: ref('conf-x'),
          mentions: [mention('m2', 'spk-gone-2', 'ada.other', 'A. L.')],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err).toBeNull()
      expect(doc('var-alias').body).toBe('Hi a speaker and a speaker')
      expect(doc('var-alias-2').body).toBe('Hi a speaker')
      expect(doc('var-alias-2').mentions).toEqual([])
      expect(result.verification?.clean).toBe(true)
    })
  })

  describe('review round 2 (Codex)', () => {
    it('reads a draft copy that inherited a posted status and holds only her typed name', async () => {
      h.dataset.push(
        variant('drafts.var-typed', 'published', 'Meet Ada Lovelace', {
          mentions: [],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('drafts.var-typed').body).toBe('Meet a speaker')
      expect(result.verification?.clean).toBe(true)
    })

    it('scrubs her handle where it is no tag — quoted, after a colon, in a profile link', async () => {
      h.dataset.push(
        variant(
          'var-raw',
          'draft',
          'Meet "@ada.bsky.social", See:@ada.bsky.social, bsky.app/profile/ada.bsky.social',
          { mentions: [] },
        ),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-raw').body).toBe(
        'Meet "a speaker", See:a speaker, bsky.app/profile/a speaker',
      )
      expect(result.verification?.clean).toBe(true)
    })

    it('leaves a namesake in a variant it reached only through an account another live speaker shares', async () => {
      h.dataset.push(
        variant(
          'var-bob-elsewhere',
          'draft',
          'Hear @team.dev with Ada Lovelace',
          {
            conference: ref('conf-x'),
            mentions: [
              mention('t-bob', BOB, 'team.dev', 'Bob Builder', 'did:plc:team'),
            ],
          },
        ),
        variant('var-team-a', 'published', 'x', {
          mentions: [
            mention('t-ada', ADA, 'team.dev', 'Ada Lovelace', 'did:plc:team'),
            mention('t-bob', BOB, 'team.dev', 'Bob Builder', 'did:plc:team'),
          ],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-bob-elsewhere').body).toBe(
        'Hear @team.dev with Ada Lovelace',
      )
      expect(result.verification?.clean).toBe(true)
    })

    it('matches a canonically equivalent spelling (decomposed Å)', async () => {
      // Either way round: a decomposed name, a composed body — and back.
      doc(ADA).name = 'A\u030Asa Berg'
      h.dataset.push(
        variant('var-nfd', 'draft', 'Meet A\u030Asa Berg', { mentions: [] }),
        variant('var-nfc', 'draft', 'Meet \u00C5sa Berg', { mentions: [] }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-nfd').body).toBe('Meet a speaker')
      expect(doc('var-nfc').body).toBe('Meet a speaker')
      expect(result.verification?.clean).toBe(true)
    })

    it('REFUSES rather than return a partial identity when her accounts keep chaining', async () => {
      // 25 records, each found by the previous one's DID and carrying the next.
      for (let i = 0; i < 25; i++)
        h.dataset.push(
          variant(`var-chain-${i}`, 'published', 'x', {
            conference: ref('conf-x'),
            mentions: [
              mention(
                `c${i}`,
                `spk-gone-${i}`,
                `h${i}.dev`,
                'X',
                i === 0 ? ADA_DID : `did:plc:${i}`,
              ),
              mention(
                `d${i}`,
                `spk-gone-${i}`,
                `h${i}.dev`,
                'X',
                `did:plc:${i + 1}`,
              ),
            ],
          }),
        )
      const before = structuredClone(h.dataset)
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err?.message).toMatch(/still being discovered/)
      expect(h.dataset).toEqual(before)
    })
  })

  describe('review round 3 (Codex)', () => {
    it('finds her handle typed in an unposted body in ANY tenant, with no record', async () => {
      h.dataset.push(
        variant('var-foreign', 'draft', 'Meet "@ada.bsky.social" today', {
          conference: ref('conf-x'),
          mentions: [],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-foreign').body).toBe('Meet "a speaker" today')
      expect(result.verification?.clean).toBe(true)
    })

    it('treats ordinary punctuation outside a link as a boundary', async () => {
      h.dataset.push(
        variant('var-colon', 'draft', 'Speaker:Ada Lovelace #Ada Lovelace', {
          mentions: [],
        }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-colon').body).toBe('Speaker:a speaker #a speaker')
    })

    it('follows a bridge record inside a variant that also references her', async () => {
      h.dataset.push(
        variant('var-bridge', 'published', 'x', {
          conference: ref('conf-x'),
          mentions: [
            adaTag(),
            mention('m-bridge', 'spk-gone', 'ada.alias', 'X', ADA_DID),
          ],
        }),
        variant('var-alias-only', 'draft', 'Hi @ada.alias', {
          conference: ref('conf-x'),
          mentions: [mention('m-a', 'spk-gone-2', 'ada.alias', 'Y')],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-alias-only').body).toBe('Hi a speaker')
      expect(doc('var-alias-only').mentions).toEqual([])
      expect(result.verification?.clean).toBe(true)
    })

    it('leaves unrelated non-NFC text byte for byte while scrubbing the name', async () => {
      const body = 'Ada Lovelace and https://example.test/e\u0301 ok'
      h.dataset.push(variant('var-nfd-url', 'draft', body, { mentions: [] }))
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-nfd-url').body).toBe(
        'a speaker and https://example.test/e\u0301 ok',
      )
    })

    it('gives an unposted variant a neutral override where it would publish the post’s own alt naming her', async () => {
      doc('post-1').attachments = [
        { _key: 'att-1', alt: 'Ada Lovelace on stage' },
        { _key: 'att-2', alt: 'The venue' },
      ]
      doc('var-scheduled').attachments = [
        { _key: 'va-1', source: 'att-1' },
        { _key: 'va-2', source: 'att-2' },
      ]
      doc('var-published').attachments = [{ _key: 'vp-1', source: 'att-1' }]
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-scheduled').attachments).toEqual([
        { _key: 'va-1', source: 'att-1', altOverride: 'a speaker on stage' },
        { _key: 'va-2', source: 'att-2' },
      ])
      expect(doc('var-published').attachments).toEqual([
        { _key: 'vp-1', source: 'att-1' },
      ])
      expect(result.verification?.clean).toBe(true)
    })
  })

  describe('review round 4 (Codex)', () => {
    it('finds her handle in a foreign variant only through the post alt it inherits', async () => {
      h.dataset.push(
        {
          _id: 'post-x',
          _type: 'socialPost',
          attachments: [{ _key: 'px', alt: 'With @ada.bsky.social' }],
        },
        variant('var-x-alt', 'draft', 'x', {
          conference: ref('conf-x'),
          post: weak('post-x'),
          mentions: [],
          attachments: [{ _key: 'vx', source: 'px' }],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-x-alt').attachments).toEqual([
        { _key: 'vx', source: 'px', altOverride: 'With a speaker' },
      ])
      expect(result.verification?.clean).toBe(true)
    })

    it('a live speaker legally named "Deleted speaker" is still looked for by name', async () => {
      doc(ADA).name = 'Deleted speaker'
      h.dataset.push(
        variant('var-ds', 'draft', 'Meet Deleted speaker', { mentions: [] }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-ds').body).toBe('Meet a speaker')
    })

    it('a placeholder is exempt only as a whole phrase', async () => {
      doc(ADA).name = 'Speaker'
      h.dataset.push(
        variant('var-data', 'draft', 'Our Data Speaker', { mentions: [] }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-data').body).toBe('Our Data a speaker')
    })

    it('ignores a malformed stored handle rather than match everywhere', async () => {
      h.dataset.push(
        variant('var-bad', 'published', 'x', {
          mentions: [mention('m-bad', ADA, '@', 'Ada Lovelace')],
        }),
        variant('var-clean', 'draft', 'Wait , what ?', {
          mentions: [],
        }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-clean').body).toBe('Wait , what ?')
      expect(doc('var-bad').mentions).toEqual([])
    })

    it('knows her handle from her profile links, with no record anywhere', async () => {
      doc(ADA).links = ['https://bsky.app/profile/ada.profile.dev']
      h.dataset.push(
        variant('var-legacy', 'draft', 'Hi @ada.profile.dev', {
          conference: ref('conf-x'),
          mentions: [],
        }),
      )
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-legacy').body).toBe('Hi a speaker')
      expect(result.verification?.clean).toBe(true)
    })

    it('binds a shared tag on the NFC form of the stored names too', async () => {
      doc(ADA).name = 'A\u030Asa Berg'
      const team = (key: string, speaker: string, name: string) =>
        mention(key, speaker, 'team.dev', name, 'did:plc:team')
      h.dataset.push(
        variant('var-nfd-team', 'draft', '\u00C5sa Berg and @team.dev', {
          mentions: [
            team('t-ada', ADA, 'A\u030Asa Berg'),
            team('t-bob', BOB, 'Bob Builder'),
          ],
        }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-nfd-team').body).toBe('a speaker and @team.dev')
    })

    it('scopes by a conference that exists only as a draft or release copy', async () => {
      h.dataset.push(
        {
          _id: 'drafts.conf-new',
          _type: 'conference',
          organization: ref('org-a'),
        },
        variant('var-new', 'draft', 'Meet Ada Lovelace', {
          conference: ref('conf-new'),
          mentions: [],
        }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-new').body).toBe('Meet a speaker')
    })
  })

  it('REFUSES, writing nothing, while a variant naming her is being published', async () => {
    h.dataset.push(variant('var-in-flight', 'publishing', TAGGED))
    const before = structuredClone(h.dataset)
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err?.message).toMatch(/var-in-flight.*being published/)
    expect(result.committed).toBe(false)
    expect(h.dataset).toEqual(before)
  })

  it('gives a variant the image branch also strips ONE patch, so its revision guard holds', async () => {
    h.dataset.push(
      { _id: 'image-adacard-1200x630-png', _type: 'sanity.imageAsset' },
      {
        _id: 'asset-ada',
        _type: 'marketingAsset',
        _rev: 'r0',
        organization: ref('org-a'),
        kind: 'image',
        subject: weak(ADA),
        image: { _type: 'image', asset: ref('image-adacard-1200x630-png') },
      },
    )
    const post = doc('post-1')
    post.attachments = [
      {
        _key: 'att-ada',
        image: { _type: 'image', asset: ref('image-adacard-1200x630-png') },
      },
    ]
    doc('var-scheduled').attachments = [{ _key: 'va-ada', source: 'att-ada' }]
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()
    expect(
      result.plan?.documentPatches.filter((p) => p.id === 'var-scheduled'),
    ).toHaveLength(1)
    expect(doc('var-scheduled').attachments).toEqual([])
    expect(adaIn(doc('var-scheduled'))).toEqual([])
  })

  it('is a fixed point: a second run plans nothing', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    const again = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(again.plan?.noop).toBe(true)
    expect(again.verification?.clean).toBe(true)
  })

  describe('the residual check reads the STORED variants', () => {
    it('a save racing the erasure is repaired with the name, handle and DID read BEFORE it — the last moment they are known', async () => {
      // Lands after the transaction: only the commit's own verification can
      // see it, and a re-run could not repair it (the identity is gone).
      h.afterCommit = () => {
        h.afterCommit = null
        h.dataset.push(
          variant('var-race-name', 'draft', 'Meet Ada Lovelace', {
            mentions: [],
          }),
          variant('var-race-did', 'published', 'x', {
            conference: ref('conf-x'),
            mentions: [mention('m', 'spk-other', 'x.dev', 'X', ADA_DID)],
          }),
        )
      }
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(doc('var-race-name').body).toBe('Meet a speaker')
      expect(doc('var-race-did').mentions).toEqual([])
      expect(result.verification?.clean).toBe(true)
    })

    it('a racing save the repair must not touch (in flight) is reported, not hidden', async () => {
      h.afterCommit = () => {
        h.afterCommit = null
        h.dataset.push(
          variant('var-race-flight', 'publishing', TAGGED),
          variant('var-race-draft', 'draft', 'Meet Ada Lovelace', {
            mentions: [],
          }),
        )
      }
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'test',
      })
      expect(result.err).toBeNull()
      expect(doc('var-race-flight').body).toBe(TAGGED)
      // The other racing save is still repaired: this is the last moment
      // the name is known.
      expect(doc('var-race-draft').body).toBe('Meet a speaker')
      // Named for the operator to clear by hand once it settles.
      expect(result.verification?.residual.postVariantIds).toEqual([
        'var-race-flight',
      ])
      expect(result.verification?.residual.postVariants).toBe(1)
      expect(result.verification?.clean).toBe(false)
    })

    it('finds a record of her account by its handle alone', async () => {
      h.dataset.push(
        variant('var-handle', 'published', 'x', {
          conference: ref('conf-x'),
          mentions: [mention('m', 'spk-other', 'Ada.bsky.social', 'X')],
        }),
      )
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      expect(doc('var-handle').mentions).toEqual([])
    })

    it('FAILS on a record of her left on a variant — by reference alone, as a later --verify has it', async () => {
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      h.dataset.push(
        variant('var-late', 'published', 'x', { mentions: [adaTag()] }),
      )
      const v = await verifySpeakerErasure(ADA)
      expect(v?.residual.postVariants).toBe(1)
      expect(v?.clean).toBe(false)
    })

    it('FAILS on her handle or DID recorded under another reference, given the identity read before', async () => {
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      h.dataset.push(
        variant('var-late', 'published', 'x', {
          conference: ref('conf-x'),
          mentions: [mention('m', 'spk-other', 'x.dev', 'X', ADA_DID)],
        }),
      )
      const v = await verifySpeakerErasure(ADA, [], [], { dids: [ADA_DID] })
      expect(v?.residual.postVariants).toBe(1)
      expect(v?.clean).toBe(false)
    })

    it('FAILS on her name in an unposted body, given the name read before — and says nothing of it without', async () => {
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      h.dataset.push(
        variant('var-late', 'draft', 'Meet Ada Lovelace', { mentions: [] }),
      )
      const v = await verifySpeakerErasure(ADA, [], [], {
        names: ['Ada Lovelace'],
      })
      expect(v?.residual.postVariants).toBe(1)
      expect(v?.clean).toBe(false)
      // The documented limit (runbook): a standalone --verify has no name to
      // look for once the erasure has replaced it.
      expect((await verifySpeakerErasure(ADA))?.residual.postVariants).toBe(0)
    })

    it('FAILS on her name in a variant’s alt text', async () => {
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      h.dataset.push(
        variant('var-late', 'draft', 'x', {
          mentions: [],
          attachments: [
            { _key: 'a', source: 's', altOverride: 'Ada Lovelace' },
          ],
        }),
      )
      const v = await verifySpeakerErasure(ADA, [], [], {
        names: ['Ada Lovelace'],
      })
      expect(v?.residual.postVariants).toBe(1)
    })

    it('FAILS on her tag in an unposted body', async () => {
      await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
      h.dataset.push(
        variant('var-late', 'scheduled', 'Hi @Ada.bsky.social', {
          mentions: [],
        }),
      )
      const v = await verifySpeakerErasure(ADA, [], [], {
        handles: ['ada.bsky.social'],
      })
      expect(v?.residual.postVariants).toBe(1)
    })
  })
})
