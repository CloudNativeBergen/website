import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../../__tests__/mocks/msw/server'
import {
  BlueskyPublishAdapter,
  formatBlueskyExternalId,
  parseBlueskyExternalId,
} from '../bluesky'
import { PLATFORM_CONSTRAINTS, validatePublishInput } from '../constraints'
import {
  BLOB_CID,
  bufferedFetch,
  callsTo,
  DID,
  hosts,
  IMAGE_URL,
  OG_IMAGE_URL,
  PAGE_URL,
  pds,
  pngBytes,
  POST_CID,
  POST_URI,
  RATE_LIMIT_RESET,
  RKEY,
} from './bluesky-fixtures'

const CREDENTIALS = { identifier: 'cndn.bsky.social', appPassword: 'abcd-efgh' }
const NOW = new Date('2026-09-14T09:00:00.000Z')

function adapter(
  linkCardHosts: readonly string[] = ['cloudnativedays.no'],
  options: { budgetMs?: number; callTimeoutMs?: number } = {},
) {
  return new BlueskyPublishAdapter(CREDENTIALS, {
    now: () => NOW,
    linkCardHosts,
    resolveHost: async () => ['93.184.216.34'],
    ...options,
  })
}

describe('BlueskyPublishAdapter — constraints and validate', () => {
  it('exposes the shared platform constraints and delegates validate to them', () => {
    const a = adapter()
    expect(a.platform).toBe('bluesky')
    expect(a.constraints).toBe(PLATFORM_CONSTRAINTS.bluesky)
    expect(a.validate({ text: 'x'.repeat(301), media: [] })).toEqual([
      { field: 'body', message: '301 characters, the limit is 300.' },
    ])
    expect(a.validate({ text: '🇳🇴'.repeat(300), media: [] })).toEqual([])
  })
})

describe('BlueskyPublishAdapter — text-only publish', () => {
  it('logs in once, creates the post record with detected facets, and returns the strong ref and public URL', async () => {
    const recorded = pds()

    const outcome = await adapter().publish({
      text: 'Tickets are live 🎉 https://cloudnativedays.no/tickets',
      media: [],
    })

    expect(outcome).toEqual({
      ok: true,
      externalId: JSON.stringify({ uri: POST_URI, cid: POST_CID }),
      url: `https://bsky.app/profile/${DID}/post/${RKEY}`,
    })
    expect(callsTo(recorded, 'com.atproto.server.createSession')).toHaveLength(
      1,
    )
    expect(
      callsTo(recorded, 'com.atproto.server.createSession')[0].body,
    ).toEqual({
      identifier: 'cndn.bsky.social',
      password: 'abcd-efgh',
    })
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    expect(create.headers.get('authorization')).toBe('Bearer access-jwt')
    expect(create.body).toEqual({
      repo: DID,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: 'Tickets are live 🎉 https://cloudnativedays.no/tickets',
        createdAt: NOW.toISOString(),
        facets: [
          {
            // Byte offsets: the emoji before the URL is four bytes, not one.
            index: { byteStart: 22, byteEnd: 56 },
            features: [
              {
                $type: 'app.bsky.richtext.facet#link',
                uri: 'https://cloudnativedays.no/tickets',
              },
            ],
          },
        ],
      },
    })
  })
})

describe('BlueskyPublishAdapter — embeds', () => {
  it('builds the external card from the linked page metadata with the tagged link as its uri and the og:image as thumb', async () => {
    const recorded = pds()
    hosts()

    const outcome = await adapter().publish({
      text: 'Early bird is on.',
      media: [],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: true })
    expect(recorded.uploads).toEqual([{ encoding: 'image/png', size: 128 }])
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    expect(
      (create.body as { record: Record<string, unknown> }).record,
    ).toMatchObject({
      text: 'Early bird is on.',
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: PAGE_URL,
          title: 'Tickets & prices — Cloud Native Days',
          description: 'Early bird until 1 October.',
          thumb: {
            $type: 'blob',
            ref: { $link: BLOB_CID },
            mimeType: 'image/png',
            size: 128,
          },
        },
      },
    })
  })

  it('still ships a bare card (hostname title, no thumb) when the page cannot be read', async () => {
    const recorded = pds()
    server.use(http.get(PAGE_URL.split('?')[0], () => HttpResponse.error()))

    const outcome = await adapter().publish({
      text: 'Go',
      media: [],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: true })
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    expect(
      (create.body as { record: Record<string, unknown> }).record,
    ).toMatchObject({
      embed: {
        external: {
          uri: PAGE_URL,
          title: 'cloudnativedays.no',
          description: '',
        },
      },
    })
    expect(recorded.uploads).toEqual([])
  })

  it('never fetches a link on a host the conference does not own — a bare card ships instead', async () => {
    const recorded = pds()
    let pageHits = 0
    server.use(
      http.get(PAGE_URL.split('?')[0], () => {
        pageHits++
        return HttpResponse.html('<meta property="og:title" content="Leaked">')
      }),
    )

    const outcome = await adapter(['other-conference.no']).publish({
      text: 'Go',
      media: [],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: true })
    expect(pageHits).toBe(0)
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    expect(
      (create.body as { record: Record<string, unknown> }).record,
    ).toMatchObject({
      embed: { external: { uri: PAGE_URL, title: 'cloudnativedays.no' } },
    })
  })

  it('with a link AND an image the card is posted with the variant image as its thumbnail (spec §4.1 demo)', async () => {
    const recorded = pds()
    let ogImageHits = 0
    hosts()
    server.use(
      http.get(OG_IMAGE_URL, () => {
        ogImageHits++
        return HttpResponse.arrayBuffer(pngBytes(64).buffer as ArrayBuffer, {
          headers: { 'content-type': 'image/png' },
        })
      }),
    )

    const outcome = await adapter().publish({
      text: 'Meet our keynote.',
      media: [
        {
          url: IMAGE_URL,
          mimeType: 'image/png',
          alt: 'Keynote speaker on stage',
        },
      ],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: true })
    // The variant image, not og:image, is the thumb — and og:image is not fetched.
    expect(recorded.uploads).toEqual([{ encoding: 'image/png', size: 256 }])
    expect(ogImageHits).toBe(0)
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    const record = (create.body as { record: Record<string, unknown> }).record
    expect(record.text).toBe('Meet our keynote.')
    expect(record.facets).toBeUndefined()
    expect(record.embed).toMatchObject({
      $type: 'app.bsky.embed.external',
      external: {
        uri: PAGE_URL,
        title: 'Tickets & prices — Cloud Native Days',
        thumb: { ref: { $link: BLOB_CID }, size: 256 },
      },
    })
  })

  it('a variant image over the thumb cap is re-requested as a smaller rendition of the SAME image, never swapped for og:image', async () => {
    const recorded = pds()
    hosts({ imageSize: 1_000_001, ogImageSize: 96 })
    const widths: (string | null)[] = []
    server.use(
      http.get(IMAGE_URL.split('?')[0], ({ request }) => {
        const w = new URL(request.url).searchParams.get('w')
        widths.push(w)
        return HttpResponse.arrayBuffer(
          pngBytes(w === '1000' ? 512 : 1_000_001).buffer as ArrayBuffer,
          { headers: { 'content-type': 'image/png' } },
        )
      }),
    )

    const outcome = await adapter().publish({
      text: 'Big picture.',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'Huge' }],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: true })
    expect(widths).toEqual(['1200', '1000'])
    expect(recorded.uploads).toEqual([{ encoding: 'image/png', size: 512 }])
  })

  it('a thumbnail still over the cap at thumbnail size is a rejection, not a silent swap', async () => {
    const recorded = pds()
    hosts({ imageSize: 1_000_001, ogImageSize: 96 })

    const outcome = await adapter().publish({
      text: 'Big picture.',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'Huge' }],
      link: PAGE_URL,
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('without a link the images are the embed, each with its CDN MIME type and alt text', async () => {
    const recorded = pds()
    hosts()

    const outcome = await adapter().publish({
      text: 'Meet our keynote.',
      media: [
        {
          url: IMAGE_URL,
          mimeType: 'image/png',
          alt: 'Keynote speaker on stage',
        },
      ],
    })

    expect(outcome).toMatchObject({ ok: true })
    expect(recorded.uploads).toEqual([{ encoding: 'image/png', size: 256 }])
    const [create] = callsTo(recorded, 'com.atproto.repo.createRecord')
    const record = (create.body as { record: Record<string, unknown> }).record
    expect(record.embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        {
          alt: 'Keynote speaker on stage',
          image: {
            $type: 'blob',
            ref: { $link: BLOB_CID },
            mimeType: 'image/png',
            size: 256,
          },
        },
      ],
    })
  })

  it('a rendition the CDN answers 404 for is a definite rejection, not a retry', async () => {
    const recorded = pds()
    server.use(
      http.get(IMAGE_URL.split('?')[0], () =>
        HttpResponse.text('gone', { status: 404 }),
      ),
    )
    const outcome = await adapter().publish({
      text: 'Gone',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'a' }],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('a 429 from the image CDN is transient (the retry policy applies), not a terminal rejection', async () => {
    const recorded = pds()
    server.use(
      http.get(IMAGE_URL.split('?')[0], () =>
        HttpResponse.text('slow down', { status: 429 }),
      ),
    )
    const outcome = await adapter().publish({
      text: 'Later',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'a' }],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('refuses an image over 2,000,000 bytes before anything is created', async () => {
    const recorded = pds()
    hosts({ imageSize: 2_000_001 })

    const outcome = await adapter().publish({
      text: 'Big',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'Huge' }],
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    expect((outcome as { message: string }).message).toContain('too-large')
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('validate refuses a second image next to a link, exactly as the editor does', () => {
    const image = { url: IMAGE_URL, mimeType: 'image/png', alt: 'a' }
    expect(
      adapter().validate({
        text: 'Two',
        media: [image, image],
        link: PAGE_URL,
      }),
    ).toEqual(
      validatePublishInput(PLATFORM_CONSTRAINTS.bluesky, {
        text: 'Two',
        media: [image, image],
        link: PAGE_URL,
      }),
    )
    expect(
      adapter().validate({
        text: 'Two',
        media: [image, image],
        link: PAGE_URL,
      }),
    ).toHaveLength(1)
  })
})

describe('BlueskyPublishAdapter — login and outcome mapping', () => {
  it('a rejected login is credential-expired, tried exactly once, and nothing else is called', async () => {
    const recorded = pds({ login: 'invalid' })

    const outcome = await adapter().publish({ text: 'Hi', media: [] })

    expect(outcome).toMatchObject({ ok: false, kind: 'credential-expired' })
    expect(callsTo(recorded, 'com.atproto.server.createSession')).toHaveLength(
      1,
    )
    expect(recorded.calls).toHaveLength(1)
  })

  it('a PDS outage at login is transient (nothing was posted)', async () => {
    pds({ login: 'down' })
    expect(await adapter().publish({ text: 'Hi', media: [] })).toMatchObject({
      ok: false,
      kind: 'transient',
    })
  })

  it('a 429 carries retryAfter from ratelimit-reset', async () => {
    pds({ create: 'rate-limited' })
    const outcome = await adapter().publish({ text: 'Hi', media: [] })
    expect(outcome).toMatchObject({ ok: false, kind: 'rate-limited' })
    expect((outcome as { retryAfter?: Date }).retryAfter).toEqual(
      new Date(RATE_LIMIT_RESET * 1000),
    )
  })

  it('a 4xx from createRecord is a definite rejection; a 5xx or a dropped connection is ambiguous', async () => {
    pds({ create: 'bad-request' })
    expect(await adapter().publish({ text: 'Hi', media: [] })).toMatchObject({
      ok: false,
      kind: 'rejected',
    })
    pds({ create: 'down' })
    expect(await adapter().publish({ text: 'Hi', media: [] })).toMatchObject({
      ok: false,
      kind: 'ambiguous',
    })
    pds({ create: 'network' })
    expect(await adapter().publish({ text: 'Hi', media: [] })).toMatchObject({
      ok: false,
      kind: 'ambiguous',
    })
  })

  it('a 401 on the create is credential-expired and the library refreshes rather than logging in again', async () => {
    const recorded = pds({ create: 'invalid' })
    expect(await adapter().publish({ text: 'Hi', media: [] })).toMatchObject({
      ok: false,
      kind: 'credential-expired',
    })
    expect(callsTo(recorded, 'com.atproto.server.createSession')).toHaveLength(
      1,
    )
  })

  it('after a 401 on the create the library refreshes and replays the create once — still one login, one post', async () => {
    const recorded = pds({ create: 'expired-once', refresh: 'ok' })
    const outcome = await new BlueskyPublishAdapter(CREDENTIALS, {
      now: () => NOW,
      fetch: bufferedFetch,
    }).publish({ text: 'Hi', media: [] })
    expect(outcome).toMatchObject({ ok: true })
    expect(callsTo(recorded, 'com.atproto.server.createSession')).toHaveLength(
      1,
    )
    expect(callsTo(recorded, 'com.atproto.server.refreshSession')).toHaveLength(
      1,
    )
    const creates = callsTo(recorded, 'com.atproto.repo.createRecord')
    expect(creates).toHaveLength(2)
    expect(creates[1].headers.get('authorization')).toBe('Bearer access-jwt-2')
  })

  it('an upload failure before the create is transient (5xx) — never ambiguous', async () => {
    const recorded = pds({ upload: 'down' })
    hosts()
    const outcome = await adapter().publish({
      text: 'Hi',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: 'a' }],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('refuses invalid input itself, without logging in', async () => {
    const recorded = pds()
    const outcome = await adapter().publish({
      text: 'Hi',
      media: [{ url: IMAGE_URL, mimeType: 'image/png', alt: '' }],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    expect(recorded.calls).toHaveLength(0)
  })

  it('a stalled login is transient once the publish budget runs out — nothing was created', async () => {
    const recorded = pds({ delayMs: { login: 400 } })
    const outcome = await adapter(undefined, { budgetMs: 100 }).publish({
      text: 'Hi',
      media: [],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('a create that outlives its call timeout is ambiguous — the post may exist', async () => {
    pds({ delayMs: { create: 400 } })
    const outcome = await adapter(undefined, { callTimeoutMs: 100 }).publish({
      text: 'Hi',
      media: [],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })

  it('refuses to start the create with too little budget left, as a safe transient', async () => {
    const recorded = pds({ delayMs: { login: 300 } })
    // Budget outlives the login but not the 5 s the create insists on.
    const outcome = await adapter(undefined, { budgetMs: 2_000 }).publish({
      text: 'Hi',
      media: [],
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsTo(recorded, 'com.atproto.repo.createRecord')).toHaveLength(0)
  })

  it('round-trips the strong ref through externalId', () => {
    const id = formatBlueskyExternalId({ uri: POST_URI, cid: POST_CID })
    expect(parseBlueskyExternalId(id)).toEqual({ uri: POST_URI, cid: POST_CID })
    expect(parseBlueskyExternalId('12345')).toBeNull()
    expect(parseBlueskyExternalId(null)).toBeNull()
  })
})
