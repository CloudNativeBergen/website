// @vitest-environment node
/**
 * The manual post view (tagging spec §4.4, Publish): a Bluesky variant of an
 * organization with no Bluesky connection goes `awaiting-manual` and never
 * reaches the engine's check. The view runs the approval check when it opens
 * and shows the body that passes it. The reads are EXECUTED GROQ; only the
 * Bluesky lookup (the network) is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  resolve: vi.fn(),
  readError: false,
}))
vi.mock('@/lib/sanity/client', () => {
  const run = async (query: string, params: Record<string, unknown> = {}) => {
    if (h.readError) throw new Error('Sanity unreachable')
    return (await evaluate(parse(query), { dataset: h.dataset, params })).get()
  }
  return { clientReadUncached: { fetch: run }, clientWrite: { fetch: run } }
})
vi.mock('./resolve', () => ({ resolveBlueskyHandle: h.resolve }))

import { manualPostBody, withManualBody } from './verify'
import type { SocialVariantEditorData } from '@/lib/social/types'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const mention = (id: string, handle: string, name: string) => ({
  _key: id,
  _type: 'socialPostMention',
  handle,
  did: `did:plc:${id}`,
  speaker: { ...ref(id), _weak: true },
  name,
  status: 'tagged',
})
const BODY = '🎙️ @alice.dev and @bob.dev are speaking at the conf.'

function seed(aliceOptedOut: boolean) {
  h.dataset = [
    { _id: 'conf-A', _type: 'conference', socialLinks: [] },
    {
      _id: 'alice',
      _type: 'speaker',
      name: 'Alice Smith',
      links: ['https://bsky.app/profile/alice.dev'],
      ...(aliceOptedOut ? { socialTagOptOut: true } : {}),
    },
    {
      _id: 'bob',
      _type: 'speaker',
      name: 'Bob Jones',
      links: ['https://bsky.app/profile/bob.dev'],
    },
    {
      _id: 'talk-A',
      _type: 'talk',
      conference: ref('conf-A'),
      speakers: [ref('alice'), ref('bob')],
    },
    {
      _id: 'variant-A',
      _type: 'socialPostVariant',
      conference: ref('conf-A'),
      platform: 'bluesky',
      body: BODY,
      mentions: [
        mention('alice', 'alice.dev', 'Alice Smith'),
        mention('bob', 'bob.dev', 'Bob Jones'),
      ],
    },
  ]
}

beforeEach(() => {
  h.readError = false
  h.resolve.mockReset()
  h.resolve.mockImplementation(async (handle: string) => ({
    kind: 'resolved',
    did: `did:plc:${handle.split('.')[0]}`,
  }))
})

const input = { conferenceId: 'conf-A', variantId: 'variant-A', body: BODY }

describe('manualPostBody', () => {
  it('a speaker who opted out after approval: the plain name, the others still tagged', async () => {
    seed(true)
    expect(await manualPostBody(input)).toEqual({
      body: '🎙️ Alice Smith and @bob.dev are speaking at the conf.',
      untagged: ['Alice Smith'],
      removed: 0,
    })
    // Her handle is never looked up.
    expect(h.resolve).not.toHaveBeenCalledWith('alice.dev')
  })

  it('nobody opted out: nothing to change', async () => {
    seed(false)
    expect(await manualPostBody(input)).toBeNull()
  })

  it('a handle that no longer resolves to the checked account is also shown plain', async () => {
    seed(false)
    h.resolve.mockImplementation(async (handle: string) =>
      handle === 'bob.dev'
        ? { kind: 'resolved', did: 'did:plc:someone-else' }
        : { kind: 'resolved', did: 'did:plc:alice' },
    )
    expect(await manualPostBody(input)).toEqual({
      body: '🎙️ @alice.dev and Bob Jones are speaking at the conf.',
      untagged: ['Bob Jones'],
      removed: 0,
    })
  })

  it('an erased speaker: neither the tag NOR the recorded name — a neutral word, and no name in the note (GDPR)', async () => {
    seed(false)
    h.dataset = h.dataset.map((d) =>
      d._id === 'alice'
        ? { _id: 'alice', _type: 'speaker', name: '', erasedAt: '2026-09-01' }
        : d,
    )
    const out = await manualPostBody(input)
    expect(out).toEqual({
      body: '🎙️ a speaker and @bob.dev are speaking at the conf.',
      untagged: [],
      removed: 1,
    })
    expect(JSON.stringify(out)).not.toContain('Alice')
  })

  it('Bluesky unreachable is a warning, not a refusal: the tags stay', async () => {
    seed(false)
    h.resolve.mockRejectedValue(new Error('network down'))
    expect(await manualPostBody(input)).toBeNull()
  })

  it('reads nothing of another conference: a foreign variant id yields no change', async () => {
    seed(true)
    expect(
      await manualPostBody({ ...input, conferenceId: 'conf-B' }),
    ).toBeNull()
  })
})

describe('withManualBody — which editor reads run the check', () => {
  const data = (
    platform: 'bluesky' | 'linkedin',
    status: SocialVariantEditorData['variant']['status'],
  ) =>
    ({
      variant: { _id: 'variant-A', platform, status, body: BODY },
      post: { attachments: [], defaultScheduledAt: null },
    }) as unknown as SocialVariantEditorData

  it.each(['awaiting-manual', 'failed'] as const)(
    'a Bluesky variant %s carries the body that passes',
    async (status) => {
      seed(true)
      const out = await withManualBody(data('bluesky', status), 'conf-A')
      expect(out.manualBody).toEqual({
        body: '🎙️ Alice Smith and @bob.dev are speaking at the conf.',
        untagged: ['Alice Smith'],
        removed: 0,
      })
    },
  )

  it.each([
    ['bluesky', 'scheduled'],
    ['bluesky', 'published'],
    ['linkedin', 'awaiting-manual'],
  ] as const)('%s %s: no check, no lookup', async (platform, status) => {
    seed(true)
    const out = await withManualBody(data(platform, status), 'conf-A')
    expect(out).not.toHaveProperty('manualBody')
    expect(h.resolve).not.toHaveBeenCalled()
  })

  it('a check that throws shows the stored body instead of failing the view', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed(true)
    h.readError = true
    const out = await withManualBody(
      data('bluesky', 'awaiting-manual'),
      'conf-A',
    )
    expect(out).not.toHaveProperty('manualBody')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
