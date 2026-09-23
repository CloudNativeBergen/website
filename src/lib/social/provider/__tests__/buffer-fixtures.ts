import { delay, http, HttpResponse } from 'msw'
import { server } from '../../../../../__tests__/mocks/msw/server'

/**
 * Fixtures for Buffer's GraphQL API (`https://api.buffer.com`). Every shape
 * below mirrors Buffer's DOCUMENTED schema — not a guess, and not a claim
 * about how Buffer behaves (that evidence is the #1126 spike):
 *
 *  - `channel(input: { id })` → `Channel { service, type, descriptor,
 *    linkShortening { isEnabled } }` — developers.buffer.com/types/Channel,
 *    /types/ChannelLinkShortening, /types/Service, /types/ChannelType.
 *  - `createPost` → the `PostActionPayload` union: `PostActionSuccess
 *    { post }` or a `MutationError` (`InvalidInputError`, `UnauthorizedError`,
 *    `LimitReachedError`, `NotFoundError`, `UnexpectedError`,
 *    `RestProxyError { code, link }`) — /types/PostActionPayload.
 *  - `post(input: { id })` → `Post { status, externalLink, error
 *    { message, supportUrl } }`; `PostStatus` ∈ draft, error,
 *    needs_approval, scheduled, sending, sent — /types/Post, /types/PostStatus,
 *    /types/PostPublishingError.
 *  - System errors in `errors[]` with `extensions.code` (UNAUTHORIZED,
 *    FORBIDDEN, NOT_FOUND, UNEXPECTED, RATE_LIMIT_EXCEEDED), HTTP 200 —
 *    /guides/error-handling. A 429 carries `retry-after` in seconds and a
 *    RATE_LIMIT_EXCEEDED body — /guides/api-limits.
 */

export const BUFFER_ENDPOINT = 'https://api.buffer.com'
export const API_KEY = 'buffer-personal-key'
export const CHANNEL_ID = '66f1a2b3c4d5e6f708192a3b'
export const POST_ID = '66f1a2b3c4d5e6f708192a3c'
export const SHARE_URN = 'urn:li:share:7243851234567890123'
export const POST_URL = `https://www.linkedin.com/feed/update/${SHARE_URN}`
/** Seconds the rate-limited fixture reports as `retry-after`. */
export const RETRY_AFTER_SECONDS = 753

export interface RecordedCall {
  operationName: string
  query: string
  variables: Record<string, unknown>
  authorization: string | null
}

export type Fault =
  | 'network'
  | 'http-400'
  | 'http-401'
  | 'http-429'
  | 'http-502'
  | 'not-json'
  | {
      errorCode: string
      message?: string
      /**
       * `{ data: { <field>: null }, errors }` instead of `data: null` — the
       * other form GraphQL may give a failed root field.
       */
      nulledField?: boolean
    }

export interface BufferBehaviour {
  /** The pinned channel as Buffer reports it (merged over a valid page). */
  channel?: Partial<ChannelShape> | Fault
  /** `createPost`'s answer: a union member, or a transport-level fault. */
  create?:
    | { __typename: 'PostActionSuccess'; post?: { id?: string } }
    | { __typename: string; message: string; code?: number }
    | Fault
  /** `post`'s answer. */
  post?: Partial<PostShape> | Fault
  delayMs?: { channel?: number; create?: number; post?: number }
}

export interface ChannelShape {
  id: string
  service: string
  type: string
  descriptor: string
  linkShortening: { isEnabled: boolean }
}

export interface PostShape {
  id: string
  status: string
  externalLink: string | null
  error: { message: string; supportUrl: string | null } | null
}

export const LINKEDIN_PAGE: ChannelShape = {
  id: CHANNEL_ID,
  service: 'linkedin',
  type: 'page',
  descriptor: 'LinkedIn Page',
  linkShortening: { isEnabled: false },
}

function isFault(value: unknown): value is Fault {
  return (
    typeof value === 'string' ||
    (typeof value === 'object' && value !== null && 'errorCode' in value)
  )
}

function faultResponse(fault: Fault, field: string): Response {
  if (fault === 'network') return HttpResponse.error()
  if (fault === 'http-400') {
    return HttpResponse.json(
      { errors: [{ message: 'Syntax Error: Unexpected Name "mutatio"' }] },
      { status: 400 },
    )
  }
  if (fault === 'http-401') {
    return HttpResponse.json(
      {
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } },
        ],
      },
      { status: 401 },
    )
  }
  if (fault === 'http-429') {
    return HttpResponse.json(
      {
        errors: [
          {
            message:
              'Too many requests from this client. Please try again later.',
            extensions: { code: 'RATE_LIMIT_EXCEEDED', window: '15m' },
          },
        ],
      },
      {
        status: 429,
        headers: { 'retry-after': String(RETRY_AFTER_SECONDS) },
      },
    )
  }
  if (fault === 'http-502') {
    return new HttpResponse('<html>Bad Gateway</html>', { status: 502 })
  }
  if (fault === 'not-json') {
    return new HttpResponse('upstream said something', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  }
  return HttpResponse.json({
    data: fault.nulledField ? { [field]: null } : null,
    errors: [
      {
        message: fault.message ?? `Buffer ${fault.errorCode}`,
        extensions: { code: fault.errorCode },
      },
    ],
  })
}

/** Install a Buffer endpoint with the given behaviour for the current test. */
export function buffer(behaviour: BufferBehaviour = {}): RecordedCall[] {
  const calls: RecordedCall[] = []
  server.use(
    http.post(BUFFER_ENDPOINT, async ({ request }) => {
      const body = (await request.json()) as {
        operationName?: string
        query?: string
        variables?: Record<string, unknown>
      }
      const operationName = body.operationName ?? ''
      calls.push({
        operationName,
        query: body.query ?? '',
        variables: body.variables ?? {},
        authorization: request.headers.get('authorization'),
      })
      if (operationName === 'GetChannel') {
        if (behaviour.delayMs?.channel) await delay(behaviour.delayMs.channel)
        const channel = behaviour.channel
        if (isFault(channel)) return faultResponse(channel, 'channel')
        return HttpResponse.json({
          data: { channel: { ...LINKEDIN_PAGE, ...channel } },
        })
      }
      if (operationName === 'CreatePost') {
        if (behaviour.delayMs?.create) await delay(behaviour.delayMs.create)
        const create = behaviour.create ?? {
          __typename: 'PostActionSuccess',
          post: { id: POST_ID },
        }
        if (isFault(create)) return faultResponse(create, 'createPost')
        return HttpResponse.json({ data: { createPost: create } })
      }
      if (operationName === 'GetPost') {
        if (behaviour.delayMs?.post) await delay(behaviour.delayMs.post)
        const post = behaviour.post
        if (isFault(post)) return faultResponse(post, 'post')
        return HttpResponse.json({
          data: {
            post: {
              id: POST_ID,
              status: 'sending',
              externalLink: null,
              error: null,
              ...post,
            },
          },
        })
      }
      return HttpResponse.json(
        { errors: [{ message: `unexpected operation ${operationName}` }] },
        { status: 400 },
      )
    }),
  )
  return calls
}

export function callsNamed(calls: RecordedCall[], operationName: string) {
  return calls.filter((c) => c.operationName === operationName)
}
