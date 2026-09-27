/**
 * @vitest-environment node
 *
 * Bluesky speaker tags at generation (#1150, `docs/MARKETING_TAGGING_SPEC.md`
 * §3.1, §4.1, §4.3): where a handle comes from, how it is checked, and what a
 * tagging body and its recorded mentions look like.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  blueskyHandleFromLinks,
  joinNames,
  resolveBlueskyHandle,
  speakersList,
  tagBlueskyBody,
} from '.'

describe("naming a talk's speakers (spec §4.2)", () => {
  it('{name}: one, two and three names read naturally', () => {
    expect(joinNames(['Alice'])).toBe('Alice')
    expect(joinNames(['Alice', 'Bob'])).toBe('Alice and Bob')
    expect(joinNames(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob and Carol')
    expect(joinNames([])).toBe('')
  })

  it('{speakers}: each with their title, a speaker without one is just the name', () => {
    expect(speakersList([{ name: 'Alice', jobTitle: 'SRE, Acme' }])).toBe(
      'Alice (SRE, Acme)',
    )
    expect(
      speakersList([
        { name: 'Alice', jobTitle: 'SRE, Acme' },
        { name: 'Bob', jobTitle: 'CTO, Initech' },
      ]),
    ).toBe('Alice (SRE, Acme) and Bob (CTO, Initech)')
    expect(
      speakersList([
        { name: 'Alice', jobTitle: 'SRE, Acme' },
        { name: 'Bob', jobTitle: null },
        { name: 'Carol', jobTitle: '  ' },
      ]),
    ).toBe('Alice (SRE, Acme), Bob and Carol')
  })
})

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

  it('{speakers} tags each speaker it can, beside their title; mentions[] names the SPEAKER', () => {
    const carol = {
      speakerId: 'spk-carol',
      name: 'Carol Danvers',
      jobTitle: 'Staff Engineer',
      tag: { status: 'unresolved' as const, handle: 'carol.gone' },
    }
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{speakers} on stage at {event}',
      values: {
        event: 'CNB 2027',
        speakers: 'plain value the body must not use',
      },
      people: [
        { ...alice, jobTitle: 'SRE, Acme' },
        { ...bob, jobTitle: 'CTO, Initech', tag: null },
        carol,
      ],
    })
    expect(body).toBe(
      '@alice.dev (SRE, Acme), Bob Smith (CTO, Initech) and Carol Danvers (Staff Engineer) on stage at CNB 2027',
    )
    expect(mentions).toEqual([
      {
        _key: expect.any(String),
        handle: 'alice.dev',
        did: DID_A,
        speakerId: 'spk-alice',
        name: 'Alice Liddell',
        status: 'tagged',
      },
      {
        _key: expect.any(String),
        handle: 'carol.gone',
        speakerId: 'spk-carol',
        name: 'Carol Danvers',
        status: 'unresolved',
      },
    ])
  })

  it('a skeleton with {speakers} but no {name} still tags', () => {
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{speakers}',
      values: {},
      people: [alice, bob],
    })
    expect(body).toBe('@alice.dev and @bob.example.com')
    expect(mentions.map((m) => m.speakerId)).toEqual(['spk-alice', 'spk-bob'])
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

  it('three speakers over the limit: only the LAST falls back when that is enough', () => {
    const person = (id: string, name: string, handle: string) => ({
      speakerId: id,
      name,
      jobTitle: 'SRE',
      tag: { status: 'tagged' as const, handle, did: `did:plc:${id}` },
    })
    const a = person('a', 'Ann', `${'a'.repeat(30)}.example.com`)
    const b = person('b', 'Ben', `${'b'.repeat(30)}.example.com`)
    const c = person('c', 'Cat', `${'c'.repeat(30)}.example.com`)
    // All three tagged: 3×(43-3)=+120 over the plain form; dropping ONE fits.
    const filler = 'x'.repeat(
      300 - 'Ann (SRE), Ben (SRE) and Cat (SRE) '.length - 90,
    )
    const { body, mentions } = tagBlueskyBody({
      skeleton: `{speakers} ${filler}`,
      values: {},
      people: [a, b, c],
    })
    expect(body).toBe(
      `@${a.tag.handle} (SRE), @${b.tag.handle} (SRE) and Cat (SRE) ${filler}`,
    )
    expect(graphemes(body)).toBeLessThanOrEqual(300)
    expect(mentions.map((m) => m.speakerId)).toEqual(['a', 'b'])
  })

  it('a short handle that fits while the plain name would not is NOT a tag: the body must fit both ways', () => {
    // A publish-time swap (late opt-out) puts the name back; a body that only
    // fits tagged would then fail instead of posting (spec §4.4).
    const long = {
      speakerId: 'spk-long',
      name: 'Alexandra Montgomery-Featherstonehaugh',
      tag: { status: 'tagged' as const, handle: 'al.dev', did: DID_A },
    }
    const filler = 'x'.repeat(280)
    const { body, mentions } = tagBlueskyBody({
      skeleton: `{name} ${filler}`,
      values: {},
      people: [long],
    })
    expect(graphemes(`@al.dev ${filler}`)).toBeLessThanOrEqual(300)
    expect(body).toBe(`${long.name} ${filler}`)
    expect(mentions).toEqual([])
  })

  it('a PARTIAL swap must fit too: the longest mix of tags and names is what is bounded', () => {
    // At publish only an opted-out speaker's tag goes back to the name
    // (§4.4), so any subset of tags may be swapped. Alice's name is 20 longer
    // than her tag, Bob's tag 20 longer than his name: all-tagged and
    // all-plain are both 300, but Alice swapped alone would be 320.
    const al = {
      speakerId: 'al',
      name: `Alice ${'L'.repeat(21)}`, // 27
      tag: { status: 'tagged' as const, handle: 'al.dev', did: DID_A }, // "@al.dev" = 7
    }
    const bo = {
      speakerId: 'bo',
      name: 'Bob', // 3
      tag: {
        status: 'tagged' as const,
        handle: `${'b'.repeat(10)}.bsky.social`, // "@…" = 23
        did: DID_B,
      },
    }
    const filler = 'x'.repeat(264)
    const plainForm = `${al.name} and Bob ${filler}`
    const allTagged = `@al.dev and @${bo.tag.handle} ${filler}`
    expect([graphemes(plainForm), graphemes(allTagged)]).toEqual([300, 300])
    const { body, mentions } = tagBlueskyBody({
      skeleton: `{name} ${filler}`,
      values: {},
      people: [al, bo],
    })
    // Bob (the LAST) falls back first; Alice's tag then fits every way.
    expect(body).toBe(`@al.dev and Bob ${filler}`)
    expect(mentions.map((m) => m.speakerId)).toEqual(['al'])
  })

  it('over the limit, a tag no longer than its name is kept: dropping it cannot shorten the worst case', () => {
    // Al's tag is 37 graphemes longer than his name; Bartholomew's is 23
    // SHORTER. Only Al's drop can shorten the longest form, so Bartholomew,
    // the LAST speaker, keeps his tag.
    const al = {
      speakerId: 'al',
      name: 'Al',
      tag: {
        status: 'tagged' as const,
        handle: 'al-with-a-very-long-handle.bsky.social',
        did: DID_A,
      },
    }
    const bart = {
      speakerId: 'bart',
      name: 'Bartholomew Montgomery-Smithson',
      tag: { status: 'tagged' as const, handle: 'bms.dev', did: DID_B },
    }
    const hook = 'h'.repeat(241)
    expect(graphemes(`${hook} Al and ${bart.name}`)).toBe(280)
    const { body, mentions } = tagBlueskyBody({
      skeleton: '{hook} {name}',
      values: { hook },
      people: [al, bart],
    })
    expect(body).toBe(`${hook} Al and @bms.dev`)
    expect(graphemes(body)).toBe(257)
    expect(mentions.map((m) => [m.speakerId, m.status])).toEqual([
      ['bart', 'tagged'],
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
