/**
 * @vitest-environment node
 *
 * Bluesky speaker tags at generation (#1150, `docs/MARKETING_TAGGING_SPEC.md`
 * §3.1, §4.1, §4.3): where a handle comes from, how it is checked, and what a
 * tagging body and its recorded mentions look like.
 */

import { describe, expect, it, vi } from 'vitest'
import { blueskyHandleFromLinks, resolveBlueskyHandle, tagBlueskyBody } from '.'

describe('blueskyHandleFromLinks', () => {
  it('takes the first bsky.app profile link, custom-domain handles included', () => {
    expect(
      blueskyHandleFromLinks([
        'https://github.com/alice',
        'https://bsky.app/profile/Alice.Dev',
        'https://bsky.app/profile/alice.bsky.social',
      ]),
    ).toBe('alice.dev')
  })

  it('accepts a link without a scheme, with a trailing path, or with an @', () => {
    expect(blueskyHandleFromLinks(['bsky.app/profile/bob.example.com/'])).toBe(
      'bob.example.com',
    )
    expect(
      blueskyHandleFromLinks(['https://www.bsky.app/profile/@carol.dev?x=1']),
    ).toBe('carol.dev')
  })

  it('a did: profile URL yields no handle', () => {
    expect(
      blueskyHandleFromLinks([
        'https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur',
      ]),
    ).toBeNull()
  })

  it('skips a did: link and takes a later handle link', () => {
    expect(
      blueskyHandleFromLinks([
        'https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur',
        'https://bsky.app/profile/dave.dev',
      ]),
    ).toBe('dave.dev')
  })

  it('refuses what is not a handle, and a host that merely ends in bsky.app', () => {
    expect(
      blueskyHandleFromLinks([
        'https://bsky.app/profile/nodot',
        'https://notbsky.app/profile/eve.dev',
        'https://bsky.app/profile/%E0%A4%A',
        'https://bsky.app/profile/bad_char.dev',
      ]),
    ).toBeNull()
    expect(blueskyHandleFromLinks(undefined)).toBeNull()
    expect(blueskyHandleFromLinks([])).toBeNull()
  })
})

describe('resolveBlueskyHandle', () => {
  const DID = 'did:plc:z72i7hdynmk6r22z27h6tvur'
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  it('asks the public, unauthenticated AppView and returns the DID', async () => {
    const fetchImpl = vi.fn(async () => json(200, { did: DID }))
    await expect(
      resolveBlueskyHandle('alice.dev', { fetch: fetchImpl }),
    ).resolves.toEqual({ kind: 'resolved', did: DID })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=alice.dev',
    )
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('a definite "Unable to resolve handle" is not-found', async () => {
    const fetchImpl = vi.fn(async () =>
      json(400, {
        error: 'InvalidRequest',
        message: 'Unable to resolve handle',
      }),
    )
    await expect(
      resolveBlueskyHandle('ghost.dev', { fetch: fetchImpl }),
    ).resolves.toEqual({ kind: 'not-found' })
  })

  it('a 5xx, a thrown fetch or a body that is not a DID is unreachable, never not-found', async () => {
    for (const fetchImpl of [
      vi.fn(async () => json(502, { error: 'UpstreamFailure' })),
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
      vi.fn(async () => json(200, { did: 'not a did' })),
    ]) {
      await expect(
        resolveBlueskyHandle('alice.dev', { fetch: fetchImpl }),
      ).resolves.toEqual({ kind: 'unreachable' })
    }
  })

  it('gives up after its timeout, whatever the fetch does', async () => {
    vi.useFakeTimers()
    try {
      // A fetch that ignores the abort signal and never settles.
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
      const result = resolveBlueskyHandle('slow.dev', {
        fetch: fetchImpl,
        timeoutMs: 2000,
      })
      await vi.advanceTimersByTimeAsync(1999)
      let settled = false
      void result.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toEqual({ kind: 'unreachable' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('tagBlueskyBody', () => {
  const DID_A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
  const DID_B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
  const alice = {
    speakerId: 'spk-alice',
    name: 'Alice Liddell',
    tag: { status: 'tagged' as const, handle: 'alice.dev', did: DID_A },
  }
  const bob = {
    speakerId: 'spk-bob',
    name: 'Bob Smith',
    tag: { status: 'tagged' as const, handle: 'bob.example.com', did: DID_B },
  }
  const values = { event: 'CNB 2027', name: 'Alice Liddell' }
  const graphemes = (s: string) =>
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)]
      .length

  it('puts the handle where {name} is and records the tag with its DID', () => {
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{name} is speaking at {event}!',
      values,
      people: [alice],
    })
    expect(body).toBe('@alice.dev is speaking at CNB 2027!')
    expect(mentions).toEqual([
      {
        _key: expect.any(String),
        handle: 'alice.dev',
        did: DID_A,
        speakerId: 'spk-alice',
        name: 'Alice Liddell',
        status: 'tagged',
      },
    ])
  })

  it('an unresolved handle reads as the plain name and is recorded as unresolved', () => {
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{name} at {event}',
      values,
      people: [
        { ...alice, tag: { status: 'unresolved', handle: 'alice.dev' } },
      ],
    })
    expect(body).toBe('Alice Liddell at CNB 2027')
    expect(mentions).toEqual([
      {
        _key: expect.any(String),
        handle: 'alice.dev',
        speakerId: 'spk-alice',
        name: 'Alice Liddell',
        status: 'unresolved',
      },
    ])
  })

  it('no tag to offer (opted out, no link, our own account) is the plain name and no entry', () => {
    expect(
      tagBlueskyBody({
        skeleton: '{name} at {event}',
        values,
        people: [{ ...alice, tag: null }],
      }),
    ).toEqual({ body: 'Alice Liddell at CNB 2027', mentions: [] })
  })

  it('a skeleton without {name} tags nobody and records nothing', () => {
    expect(
      tagBlueskyBody({
        skeleton: 'See you at {event}',
        values,
        people: [alice],
      }),
    ).toEqual({ body: 'See you at CNB 2027', mentions: [] })
  })

  it('joins several people, tagging each one that has a tag', () => {
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{name} on stage',
      values: { name: 'Alice Liddell and Bob Smith' },
      people: [alice, { ...bob, tag: null }],
    })
    expect(body).toBe('@alice.dev and Bob Smith on stage')
    expect(mentions.map((m) => m.speakerId)).toEqual(['spk-alice'])
  })

  it('over 300 graphemes, names fall back to plain from the LAST one, until it fits', () => {
    // Handles are longer than names here, so tagging costs length.
    const long = (id: string, name: string, handle: string, did: string) => ({
      speakerId: id,
      name,
      tag: { status: 'tagged' as const, handle, did },
    })
    const a = long('a', 'Ann', `${'a'.repeat(40)}.example.com`, DID_A)
    const b = long('b', 'Ben', `${'b'.repeat(40)}.example.com`, DID_B)
    // Plain: "Ann and Ben " + filler = fits. Both tagged: +2×(53-3)=+100 over.
    const filler = '🎤'.repeat(230) // one grapheme each, two UTF-16 units
    const { body, mentions } = tagBlueskyBody({
      skeleton: `{name} ${filler}`,
      values: { name: 'Ann and Ben' },
      people: [a, b],
    })
    expect(body).toBe(`@${a.tag.handle} and Ben ${filler}`)
    expect(graphemes(body)).toBeLessThanOrEqual(300)
    expect(mentions.map((m) => [m.speakerId, m.status])).toEqual([
      ['a', 'tagged'],
    ])
  })

  it('when even the plain names do not fit, nobody is tagged', () => {
    const { body, mentions } = tagBlueskyBody({
      skeleton: `{name} ${'x'.repeat(300)}`,
      values,
      people: [alice],
    })
    expect(body).toBe(`Alice Liddell ${'x'.repeat(300)}`)
    expect(mentions).toEqual([])
  })

  it('gives every mention its own _key', () => {
    const { mentions } = tagBlueskyBody({
      skeleton: '{name}',
      values: { name: 'x' },
      people: [alice, bob],
    })
    expect(mentions).toHaveLength(2)
    expect(new Set(mentions.map((m) => m._key)).size).toBe(2)
    expect(mentions.every((m) => /^[a-zA-Z0-9_-]+$/.test(m._key))).toBe(true)
  })
})
