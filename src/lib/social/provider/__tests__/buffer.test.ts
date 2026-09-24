import { describe, it, expect } from 'vitest'
import {
  BUFFER_MAX_RETRY_AFTER_MS,
  BUFFER_MIN_CREATE_BUDGET_MS,
  BufferPublishAdapter,
  type BufferAdapterOptions,
} from '../buffer'
import { PLATFORM_CONSTRAINTS } from '../constraints'
import type { PublishInput } from '../types'
import {
  API_KEY,
  buffer,
  callsNamed,
  CHANNEL_ID,
  POST_ID,
  POST_URL,
  RETRY_AFTER_SECONDS,
  SHARE_URN,
  type BufferBehaviour,
} from './buffer-fixtures'

const NOW = new Date('2026-09-23T08:00:00.000Z')
const LINK =
  'https://cloudnativedays.no/tickets?utm_source=linkedin&utm_medium=social'
const IMAGE_A =
  'https://cdn.sanity.io/images/proj/prod/a-1200x628.png?w=1200&h=628&fit=crop'
const IMAGE_B =
  'https://cdn.sanity.io/images/proj/prod/b-1200x628.jpg?w=1200&h=628&fit=crop'

function adapter(options: Partial<BufferAdapterOptions> = {}) {
  return new BufferPublishAdapter(
    { apiKey: API_KEY, channelId: CHANNEL_ID },
    { platform: 'linkedin', now: () => NOW, ...options },
  )
}

const LINK_ONLY: PublishInput = {
  text: 'Early bird ends Friday. Link in the comments.',
  media: [],
  link: LINK,
}

async function publishWith(
  behaviour: BufferBehaviour,
  input: PublishInput = LINK_ONLY,
  options: Partial<BufferAdapterOptions> = {},
) {
  const calls = buffer(behaviour)
  const outcome = await adapter(options).publish(input)
  return { calls, outcome }
}

describe('BufferPublishAdapter — constraints and validate', () => {
  it('lends the platform its shared rules: LinkedIn constraints, and a body linking to the conference is refused', () => {
    const a = adapter()
    expect(a.platform).toBe('linkedin')
    expect(a.constraints).toBe(PLATFORM_CONSTRAINTS.linkedin)
    const issues = a.validate(
      { text: 'Tickets: https://cloudnativedays.no/tickets', media: [] },
      { conferenceDomains: ['cloudnativedays.no'], platformZone: null },
    )
    expect(issues.map((i) => i.field)).toEqual(['body'])
  })

  it('an invalid variant is rejected before Buffer is asked anything', async () => {
    const { calls, outcome } = await publishWith(
      {},
      {
        text: 'x'.repeat(3001),
        media: [],
      },
    )
    expect(outcome).toEqual({
      ok: false,
      kind: 'rejected',
      message: 'body: 3001 characters, the limit is 3000.',
    })
    expect(calls).toEqual([])
  })
})

describe('BufferPublishAdapter — publishing with the link as the first comment', () => {
  it('a link and no images: checks the pinned channel, then shares now with the link as the first comment', async () => {
    const { calls, outcome } = await publishWith({})

    expect(outcome).toEqual({
      ok: true,
      result: 'accepted',
      vendorPostId: POST_ID,
    })
    expect(calls.map((c) => c.operationName)).toEqual([
      'GetChannel',
      'CreatePost',
    ])
    expect(calls.every((c) => c.authorization === `Bearer ${API_KEY}`)).toBe(
      true,
    )
    expect(calls[0].variables).toEqual({ input: { id: CHANNEL_ID } })
    expect(calls[1].variables).toEqual({
      input: {
        channelId: CHANNEL_ID,
        text: LINK_ONLY.text,
        schedulingType: 'automatic',
        mode: 'shareNow',
        assets: [],
        metadata: { linkedin: { firstComment: LINK } },
      },
    })
  })

  it('a link and images: the images go as assets with their alt text, and the link is STILL the first comment', async () => {
    const { calls, outcome } = await publishWith(
      {},
      {
        text: 'Speakers announced.',
        media: [
          {
            url: IMAGE_A,
            mimeType: 'image/png',
            alt: 'The keynote speaker on stage',
          },
          { url: IMAGE_B, mimeType: 'image/jpeg', alt: 'The venue' },
        ],
        link: LINK,
      },
    )

    expect(outcome).toMatchObject({ ok: true, result: 'accepted' })
    const [create] = callsNamed(calls, 'CreatePost')
    expect(create.variables.input).toMatchObject({
      assets: [
        {
          image: {
            url: IMAGE_A,
            metadata: { altText: 'The keynote speaker on stage' },
          },
        },
        { image: { url: IMAGE_B, metadata: { altText: 'The venue' } } },
      ],
      metadata: { linkedin: { firstComment: LINK } },
    })
  })

  it('no link means no first comment; an image without alt text carries no metadata (altText is String!)', async () => {
    const { calls } = await publishWith(
      {},
      {
        text: 'See you there.',
        media: [{ url: IMAGE_A, mimeType: 'image/png', alt: '' }],
      },
    )
    const [create] = callsNamed(calls, 'CreatePost')
    expect(create.variables.input).toEqual({
      channelId: CHANNEL_ID,
      text: 'See you there.',
      schedulingType: 'automatic',
      mode: 'shareNow',
      assets: [{ image: { url: IMAGE_A } }],
    })
  })
})

describe('BufferPublishAdapter — the pinned channel check (spec §2)', () => {
  it.each([
    [
      { service: 'twitter', descriptor: 'Twitter Profile' },
      /not a LinkedIn channel/,
    ],
    [{ type: 'profile', descriptor: 'LinkedIn Profile' }, /company page/],
    [{ linkShortening: { isEnabled: true } }, /link shortening/i],
  ])(
    'a pinned channel that fails the check (%o) is rejected with what to fix, and nothing is created',
    async (channel, message) => {
      const { calls, outcome } = await publishWith({ channel })
      expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
      expect(outcome.ok === false && outcome.message).toMatch(message)
      expect(outcome.ok === false && outcome.message).toMatch(/in Buffer/)
      expect(callsNamed(calls, 'CreatePost')).toEqual([])
    },
  )

  it('names every failed check at once', async () => {
    const { outcome } = await publishWith({
      channel: {
        type: 'profile',
        descriptor: 'LinkedIn Profile',
        linkShortening: { isEnabled: true },
      },
    })
    expect(outcome.ok === false && outcome.message).toMatch(
      /company page[^]*link shortening/i,
    )
  })

  it.each([
    ['a dropped connection', 'network' as const],
    ['a 5xx', 'http-502' as const],
    ['a body that is not JSON', 'not-json' as const],
    ['a system error', { errorCode: 'UNEXPECTED' }],
  ])(
    'an unreachable check (%s) is transient: nothing was created',
    async (_label, channel) => {
      const { calls, outcome } = await publishWith({ channel })
      expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
      expect(callsNamed(calls, 'CreatePost')).toEqual([])
    },
  )

  it('a channel answer with a field error beside it is transient: no verdict on the channel, nothing created', async () => {
    const { calls, outcome } = await publishWith({
      channel: {
        rawBody: {
          data: {
            channel: {
              id: CHANNEL_ID,
              service: 'linkedin',
              type: 'page',
              descriptor: 'LinkedIn Page',
              linkShortening: { isEnabled: false },
            },
          },
          errors: [{ message: 'partial', path: ['channel', 'descriptor'] }],
        },
      },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsNamed(calls, 'CreatePost')).toEqual([])
  })

  it.each(['NOT_FOUND', 'FORBIDDEN'])(
    'a %s BENEATH the channel is transient, not a bad channel id',
    async (errorCode) => {
      const { calls, outcome } = await publishWith({
        channel: {
          errorCode,
          path: ['channel', 'linkShortening'],
          nulledField: true,
        },
      })
      expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
      expect(callsNamed(calls, 'CreatePost')).toEqual([])
    },
  )

  it('a 4xx on the check is our bug, not weather: rejected, never retried every tick', async () => {
    const { calls, outcome } = await publishWith({ channel: 'http-400' })
    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    expect(callsNamed(calls, 'CreatePost')).toEqual([])
  })

  it('a refused key reported with the channel field nulled is still credential-expired', async () => {
    const { outcome } = await publishWith({
      channel: { errorCode: 'UNAUTHORIZED', nulledField: true },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'credential-expired' })
  })

  it('a check that outlives its call timeout is transient — the create was never sent', async () => {
    const { calls, outcome } = await publishWith(
      { delayMs: { channel: 500 } },
      LINK_ONLY,
      { callTimeoutMs: 50 },
    )
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(callsNamed(calls, 'CreatePost')).toEqual([])
  })

  it.each([
    ['HTTP 401', 'http-401' as const],
    ['UNAUTHORIZED', { errorCode: 'UNAUTHORIZED' }],
  ])(
    'a refused key at the check (%s) is credential-expired',
    async (_label, channel) => {
      const { calls, outcome } = await publishWith({ channel })
      expect(outcome).toMatchObject({ ok: false, kind: 'credential-expired' })
      expect(callsNamed(calls, 'CreatePost')).toEqual([])
    },
  )

  it.each([
    ['NOT_FOUND', /channel id/],
    ['FORBIDDEN', /channel id/],
  ])(
    'a pinned channel the key cannot see (%s) is rejected',
    async (errorCode, message) => {
      const { outcome } = await publishWith({ channel: { errorCode } })
      expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
      expect(outcome.ok === false && outcome.message).toMatch(message)
    },
  )

  it('a throttled check is rate-limited, honouring Retry-After', async () => {
    const { outcome } = await publishWith({ channel: 'http-429' })
    expect(outcome).toMatchObject({
      ok: false,
      kind: 'rate-limited',
      retryAfter: new Date(NOW.getTime() + RETRY_AFTER_SECONDS * 1000),
    })
  })
})

describe('BufferPublishAdapter — the create budget', () => {
  it('refuses to start the ≈11 s create with less than the minimum budget left, as a safe transient', async () => {
    const { calls, outcome } = await publishWith({}, LINK_ONLY, {
      budgetMs: BUFFER_MIN_CREATE_BUDGET_MS - 1_000,
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' })
    expect(outcome.ok === false && outcome.message).toMatch(/budget/)
    expect(callsNamed(calls, 'GetChannel')).toHaveLength(1)
    expect(callsNamed(calls, 'CreatePost')).toEqual([])
  })
})

describe('BufferPublishAdapter — failure at create (spec §3.3)', () => {
  it.each([
    ['UnauthorizedError', 'credential-expired'],
    ['LimitReachedError', 'rejected'],
    ['InvalidInputError', 'rejected'],
    ['NotFoundError', 'rejected'],
    ['UnexpectedError', 'ambiguous'],
    ['RestProxyError', 'ambiguous'],
    // A MutationError type added after this was written: we cannot know
    // whether the post exists.
    ['VoidMutationError', 'ambiguous'],
  ])('%s → %s, carrying Buffer’s message', async (__typename, kind) => {
    const { outcome } = await publishWith({
      create: { __typename, message: `Buffer said ${__typename}`, code: 1000 },
    })
    expect(outcome).toMatchObject({ ok: false, kind })
    expect(outcome.ok === false && outcome.message).toContain(
      `Buffer said ${__typename}`,
    )
  })

  it('HTTP 429 → rate-limited, honouring Retry-After', async () => {
    const { outcome } = await publishWith({ create: 'http-429' })
    expect(outcome).toEqual({
      ok: false,
      kind: 'rate-limited',
      message: expect.stringContaining('rate limit'),
      retryAfter: new Date(NOW.getTime() + RETRY_AFTER_SECONDS * 1000),
    })
  })

  it.each([
    ['0', undefined],
    ['-30', undefined],
    ['not-a-number-or-date', undefined],
    ['900', new Date(NOW.getTime() + 900_000)],
    ['Wed, 23 Sep 2026 08:10:00 GMT', new Date('2026-09-23T08:10:00.000Z')],
    // Buffer's window is 15 minutes: a Retry-After of years is not a
    // Buffer throttle, and honouring it would park the post for years.
    ['31536000000', new Date(NOW.getTime() + BUFFER_MAX_RETRY_AFTER_MS)],
    // Past Date's range this would be an Invalid Date, and the engine's
    // settlement throws on `toISOString()`.
    [
      '100000000000000000000',
      new Date(NOW.getTime() + BUFFER_MAX_RETRY_AFTER_MS),
    ],
    [
      'Fri, 01 Jan 2100 00:00:00 GMT',
      new Date(NOW.getTime() + BUFFER_MAX_RETRY_AFTER_MS),
    ],
  ])(
    'a 429 (answered at the check; the parser is shared) with Retry-After %j yields retryAfter %j — never a date in the past or years out',
    async (header, retryAfter) => {
      const throttled: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'Too many requests',
                extensions: { code: 'RATE_LIMIT_EXCEEDED' },
              },
            ],
          }),
          { status: 429, headers: { 'retry-after': header } },
        )
      const outcome = await adapter({ fetch: throttled }).publish(LINK_ONLY)
      expect(outcome).toMatchObject({ ok: false, kind: 'rate-limited' })
      expect(outcome.ok === false && outcome.retryAfter).toEqual(retryAfter)
    },
  )

  it.each([
    ['HTTP 401', 'http-401' as const, 'credential-expired'],
    [
      'UNAUTHORIZED in errors[]',
      { errorCode: 'UNAUTHORIZED' },
      'credential-expired',
    ],
    [
      'RATE_LIMIT_EXCEEDED in errors[]',
      { errorCode: 'RATE_LIMIT_EXCEEDED' },
      'rate-limited',
    ],
    ['NOT_FOUND in errors[]', { errorCode: 'NOT_FOUND' }, 'rejected'],
    ['FORBIDDEN in errors[]', { errorCode: 'FORBIDDEN' }, 'rejected'],
    ['UNEXPECTED in errors[]', { errorCode: 'UNEXPECTED' }, 'ambiguous'],
    [
      'UNAUTHORIZED with createPost nulled rather than data',
      { errorCode: 'UNAUTHORIZED', nulledField: true },
      'credential-expired',
    ],
    // A 4xx refused the request itself (a malformed document); a 5xx may be
    // a gateway giving up on a create that went through.
    ['HTTP 400', 'http-400' as const, 'rejected'],
    ['a 5xx', 'http-502' as const, 'ambiguous'],
    ['a dropped connection', 'network' as const, 'ambiguous'],
    ['a body that is not JSON', 'not-json' as const, 'ambiguous'],
  ])('%s → %s', async (_label, create, kind) => {
    const { outcome } = await publishWith({ create })
    expect(outcome).toMatchObject({ ok: false, kind })
  })

  it('an error BENEATH createPost is ambiguous whatever its code — the create ran', async () => {
    const { outcome } = await publishWith({
      create: {
        errorCode: 'RATE_LIMIT_EXCEEDED',
        path: ['createPost', 'post', 'id'],
      },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })

  it.each(['RATE_LIMIT_EXCEEDED', 'UNAUTHORIZED'])(
    'a %s execution error AT createPost (path ["createPost"]) is ambiguous — the resolver started',
    async (errorCode) => {
      const { outcome } = await publishWith({
        create: { errorCode, path: ['createPost'] },
      })
      expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
    },
  )

  it('an HTTP 429 whose body shows createPost executing is ambiguous — the status does not outrank the path', async () => {
    const { outcome } = await publishWith({
      create: {
        status: 429,
        rawBody: {
          errors: [
            {
              message: 'Too many requests',
              path: ['createPost'],
              extensions: { code: 'RATE_LIMIT_EXCEEDED' },
            },
          ],
        },
      },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })

  it('errors that disagree on their code are ambiguous, never the first one’s verdict', async () => {
    const { outcome } = await publishWith({
      create: {
        rawBody: {
          data: null,
          errors: [
            { message: 'Not authorized', extensions: { code: 'UNAUTHORIZED' } },
            { message: 'boom', extensions: { code: 'UNEXPECTED' } },
          ],
        },
      },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })

  it('a success without a post id is ambiguous — something was accepted', async () => {
    const { outcome } = await publishWith({
      create: { __typename: 'PostActionSuccess', post: {} },
    })
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })

  // A fetch that answers the channel check from the fixture and the create
  // with the given answer — for shapes MSW's JSON helpers cannot build.
  function createAnswering(answer: () => Response | Promise<Response>) {
    const calls = buffer({})
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { operationName?: string }
      if (body.operationName === 'CreatePost') return answer()
      return fetch(input, init)
    }
    return { calls, fetchImpl }
  }

  it.each([
    [
      'a non-JSON body',
      () =>
        new Response('<html>Too Many Requests</html>', {
          status: 429,
          headers: { 'retry-after': '30', 'content-type': 'text/html' },
        }),
    ],
    [
      'a body whose read was aborted',
      () =>
        ({
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '30' }),
          json: async () => {
            throw new DOMException('The operation was aborted.', 'AbortError')
          },
        }) as unknown as Response,
    ],
  ])(
    'an HTTP 429 at create with %s is ambiguous, not rate-limited — the unread body may hold execution evidence',
    async (_label, answer) => {
      const { fetchImpl } = createAnswering(answer)
      const outcome = await adapter({ fetch: fetchImpl }).publish(LINK_ONLY)
      expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
    },
  )

  it('an HTTP 429 whose body carries a PostActionSuccess is accepted with its id — the status does not outrank the post', async () => {
    const { fetchImpl } = createAnswering(
      () =>
        new Response(
          JSON.stringify({
            data: {
              createPost: {
                __typename: 'PostActionSuccess',
                post: { id: 'created-under-429' },
              },
            },
          }),
          { status: 429, headers: { 'retry-after': '30' } },
        ),
    )
    const outcome = await adapter({ fetch: fetchImpl }).publish(LINK_ONLY)
    expect(outcome).toEqual({
      ok: true,
      result: 'accepted',
      vendorPostId: 'created-under-429',
    })
  })

  it('a create that outlives its call timeout is ambiguous — the request was sent and the post may exist', async () => {
    const { calls, outcome } = await publishWith(
      { delayMs: { create: 500 } },
      LINK_ONLY,
      { callTimeoutMs: 50, budgetMs: 30_000 },
    )
    expect(callsNamed(calls, 'CreatePost')).toHaveLength(1)
    expect(outcome).toMatchObject({ ok: false, kind: 'ambiguous' })
  })
})

describe('BufferPublishAdapter — confirm (spec §3.2)', () => {
  it('sent → published, with the LinkedIn URL and the URN it carries', async () => {
    const calls = buffer({ post: { status: 'sent', externalLink: POST_URL } })
    await expect(adapter().confirm(POST_ID)).resolves.toEqual({
      state: 'published',
      externalId: SHARE_URN,
      url: POST_URL,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      operationName: 'GetPost',
      variables: { input: { id: POST_ID } },
      authorization: `Bearer ${API_KEY}`,
    })
  })

  it('sent without an external link is still published, with nothing invented', async () => {
    buffer({ post: { status: 'sent', externalLink: null } })
    await expect(adapter().confirm(POST_ID)).resolves.toEqual({
      state: 'published',
    })
  })

  it('a link that carries no URN keeps the URL and no external id', async () => {
    buffer({
      post: {
        status: 'sent',
        externalLink: 'https://www.linkedin.com/company/1234/posts',
      },
    })
    await expect(adapter().confirm(POST_ID)).resolves.toEqual({
      state: 'published',
      url: 'https://www.linkedin.com/company/1234/posts',
    })
  })

  it.each(['sending', 'scheduled', 'draft', 'needs_approval'])(
    '%s → pending',
    async (status) => {
      buffer({ post: { status } })
      await expect(adapter().confirm(POST_ID)).resolves.toEqual({
        state: 'pending',
      })
    },
  )

  it('error → failed, carrying Buffer’s message', async () => {
    buffer({
      post: {
        status: 'error',
        error: {
          message: 'LinkedIn needs to be reconnected',
          supportUrl: null,
        },
      },
    })
    await expect(adapter().confirm(POST_ID)).resolves.toEqual({
      state: 'failed',
      message: 'LinkedIn needs to be reconnected',
    })
  })

  it.each([false, true])(
    'NOT_FOUND from the post lookup itself (path ["post"]) → gone (post field nulled: %s)',
    async (nulledField) => {
      buffer({ post: { errorCode: 'NOT_FOUND', path: ['post'], nulledField } })
      await expect(adapter().confirm(POST_ID)).resolves.toEqual({
        state: 'gone',
      })
    },
  )

  it.each([false, true])(
    'a NOT_FOUND with no path never looked the post up: unreadable, not gone (post field nulled: %s)',
    async (nulledField) => {
      buffer({ post: { errorCode: 'NOT_FOUND', nulledField } })
      await expect(adapter().confirm(POST_ID)).resolves.toMatchObject({
        state: 'unreadable',
      })
    },
  )

  it.each([
    ['a system error', { errorCode: 'UNEXPECTED' }],
    ['a refused key', { errorCode: 'UNAUTHORIZED' }],
    ['a 5xx', 'http-502' as const],
    ['a throttle', 'http-429' as const],
    ['a dropped connection', 'network' as const],
    ['a body that is not JSON', 'not-json' as const],
  ])(
    '%s → unreadable (it says nothing about the post)',
    async (_label, post) => {
      buffer({ post })
      await expect(adapter().confirm(POST_ID)).resolves.toMatchObject({
        state: 'unreadable',
      })
    },
  )

  it.each([false, true])(
    'a NOT_FOUND BENEATH the post is unreadable, not gone (post field nulled: %s)',
    async (nulledField) => {
      buffer({
        post: { errorCode: 'NOT_FOUND', path: ['post', 'status'], nulledField },
      })
      await expect(adapter().confirm(POST_ID)).resolves.toMatchObject({
        state: 'unreadable',
      })
    },
  )

  it('sent, but with a field error beside it, is unreadable — the URL it nulled would be lost for good', async () => {
    buffer({
      post: {
        rawBody: {
          data: {
            post: {
              id: POST_ID,
              status: 'sent',
              externalLink: null,
              error: null,
            },
          },
          errors: [
            {
              message: 'Could not resolve externalLink',
              path: ['post', 'externalLink'],
              extensions: { code: 'UNEXPECTED' },
            },
          ],
        },
      },
    })
    await expect(adapter().confirm(POST_ID)).resolves.toMatchObject({
      state: 'unreadable',
      message: expect.stringContaining('externalLink'),
    })
  })

  it('a throw from the fetch answer itself is caught: unreadable, carrying the message', async () => {
    // Nothing in the documented shapes can throw past `request`; this fake
    // answer does, so the outer catch is exercised on a VALUE.
    const hostile: typeof fetch = async () =>
      ({
        json: async () => {
          throw new Error('body unreadable')
        },
        get ok(): boolean {
          throw new Error('boom: the answer object is hostile')
        },
      }) as unknown as Response
    await expect(adapter({ fetch: hostile }).confirm(POST_ID)).resolves.toEqual(
      {
        state: 'unreadable',
        message: expect.stringContaining('boom: the answer object is hostile'),
      },
    )
  })

  it('an error whose fields are not the documented strings is unreadable, not a throw', async () => {
    buffer({
      post: {
        rawBody: {
          data: null,
          errors: [{ message: { toString: null }, extensions: { code: 7 } }],
        },
      },
    })
    await expect(adapter().confirm(POST_ID)).resolves.toMatchObject({
      state: 'unreadable',
    })
  })

  it('runs under its OWN deadline and ABORTS the read — the engine’s timeout only races it', async () => {
    buffer({ delayMs: { post: 1_000 }, post: { status: 'sent' } })
    const signals: AbortSignal[] = []
    const recording: typeof fetch = (input, init) => {
      if (init?.signal) signals.push(init.signal)
      return fetch(input, init)
    }
    const check = await adapter({
      fetch: recording,
      confirmTimeoutMs: 50,
    }).confirm(POST_ID)
    expect(check).toMatchObject({ state: 'unreadable' })
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(true)
  })
})
