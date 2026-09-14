import { http, HttpResponse, type HttpHandler } from 'msw'
import { server } from '../../../../../__tests__/mocks/msw/server'

/**
 * Recorded-shape fixtures for the Bluesky PDS (`bsky.social`) XRPC calls the
 * adapter makes, plus the CDN and page hosts it fetches bytes from. Response
 * bodies follow the lexicons (`com.atproto.server.createSession`,
 * `com.atproto.repo.uploadBlob`, `com.atproto.repo.createRecord`) closely
 * enough for `@atproto/api`'s own response validation to accept them.
 */

export const PDS = 'https://bsky.social'
export const XRPC = `${PDS}/xrpc`

export const DID = 'did:plc:z72i7hdynmk6r22z27h6tvur'
export const HANDLE = 'cndn.bsky.social'
export const POST_CID =
  'bafyreidsemiehpaya7tpoqfsgxvxkepmwmzfljvdovbvmmiznxuks5injm'
export const BLOB_CID =
  'bafkreih2fsgmj4ubo2565vfxg3pvngruy6ong4r6t3cc7ftuwtkgvrvyxa'
export const THUMB_CID =
  'bafkreiaf53wc24eek2knhoujvwpbynfwwtmamj24hrr3qqsbuqfoiwi4uq'
export const RKEY = '3l5xyzabc2k2c'
export const POST_URI = `at://${DID}/app.bsky.feed.post/${RKEY}`

export const IMAGE_URL =
  'https://cdn.sanity.io/images/proj/prod/abc-1200x800.png?rect=0,0,1200,800&w=1200&fit=max&auto=format&q=85'
export const PAGE_URL =
  'https://cloudnativedays.no/tickets?utm_source=bluesky&utm_medium=social'
export const OG_IMAGE_URL = 'https://cloudnativedays.no/og/tickets.png'

/** A tiny but real PNG header followed by padding, so it is bytes, not text. */
export function pngBytes(size = 256): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

export interface Recorded {
  /** Every request the PDS saw, in order: `[nsid, parsed JSON body | null]`. */
  calls: { nsid: string; body: unknown; headers: Headers }[]
  uploads: { encoding: string | null; size: number }[]
}

export interface PdsBehaviour {
  login?: 'ok' | 'invalid' | 'rate-limited' | 'down'
  upload?: 'ok' | 'too-large' | 'down'
  create?:
    'ok' | 'invalid' | 'bad-request' | 'rate-limited' | 'down' | 'network'
}

const STATUS_BODY = {
  invalid: [
    401,
    {
      error: 'AuthenticationRequired',
      message: 'Invalid identifier or password',
    },
  ],
  'bad-request': [
    400,
    { error: 'InvalidRequest', message: 'record failed validation' },
  ],
  'rate-limited': [
    429,
    { error: 'RateLimitExceeded', message: 'Rate Limit Exceeded' },
  ],
  down: [502, { error: 'UpstreamFailure', message: 'upstream failure' }],
  'too-large': [
    413,
    { error: 'PayloadTooLarge', message: 'request entity too large' },
  ],
} as const

/** Unix seconds the rate-limited fixture reports as `ratelimit-reset`. */
export const RATE_LIMIT_RESET = 1_789_000_000

function failure(kind: keyof typeof STATUS_BODY) {
  const [status, body] = STATUS_BODY[kind]
  return HttpResponse.json(body, {
    status,
    headers:
      kind === 'rate-limited'
        ? { 'ratelimit-reset': String(RATE_LIMIT_RESET) }
        : {},
  })
}

/** Install a PDS with the given behaviour for the current test. */
export function pds(behaviour: PdsBehaviour = {}): Recorded {
  const recorded: Recorded = { calls: [], uploads: [] }
  const record = async (nsid: string, request: Request) => {
    const type = request.headers.get('content-type') ?? ''
    const body = type.includes('application/json')
      ? await request.clone().json()
      : null
    recorded.calls.push({ nsid, body, headers: request.headers })
    return body
  }
  const handlers: HttpHandler[] = [
    http.post(
      `${XRPC}/com.atproto.server.createSession`,
      async ({ request }) => {
        await record('com.atproto.server.createSession', request)
        const mode = behaviour.login ?? 'ok'
        if (mode !== 'ok') return failure(mode)
        return HttpResponse.json({
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
          handle: HANDLE,
          did: DID,
          active: true,
        })
      },
    ),
    http.post(`${XRPC}/com.atproto.repo.uploadBlob`, async ({ request }) => {
      await record('com.atproto.repo.uploadBlob', request)
      const mode = behaviour.upload ?? 'ok'
      if (mode !== 'ok') return failure(mode)
      const bytes = new Uint8Array(await request.arrayBuffer())
      const encoding = request.headers.get('content-type')
      recorded.uploads.push({ encoding, size: bytes.length })
      const cid = recorded.uploads.length === 1 ? BLOB_CID : THUMB_CID
      return HttpResponse.json({
        blob: {
          $type: 'blob',
          ref: { $link: cid },
          mimeType: encoding ?? 'application/octet-stream',
          size: bytes.length,
        },
      })
    }),
    http.post(`${XRPC}/com.atproto.repo.createRecord`, async ({ request }) => {
      await record('com.atproto.repo.createRecord', request)
      const mode = behaviour.create ?? 'ok'
      if (mode === 'network') return HttpResponse.error()
      if (mode !== 'ok') return failure(mode)
      return HttpResponse.json({ uri: POST_URI, cid: POST_CID })
    }),
    // The session manager refreshes on a 401 (never a fresh login); the
    // fixture refuses so the original answer stands and nothing leaks to
    // the real host.
    http.post(
      `${XRPC}/com.atproto.server.refreshSession`,
      async ({ request }) => {
        await record('com.atproto.server.refreshSession', request)
        return HttpResponse.json(
          { error: 'ExpiredToken', message: 'Token has expired' },
          { status: 400 },
        )
      },
    ),
    // A mention the text contains would be resolved through the PDS; the
    // fixture account knows nobody.
    http.get(`${XRPC}/com.atproto.identity.resolveHandle`, () =>
      HttpResponse.json(
        { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        { status: 400 },
      ),
    ),
  ]
  server.use(...handlers)
  return recorded
}

/** The Sanity CDN rendition and the linked page + its og:image. */
export function hosts(
  options: { imageSize?: number; ogImageSize?: number; html?: string } = {},
) {
  server.use(
    http.get(IMAGE_URL.split('?')[0], () =>
      HttpResponse.arrayBuffer(
        pngBytes(options.imageSize ?? 256).buffer as ArrayBuffer,
        {
          headers: { 'content-type': 'image/png' },
        },
      ),
    ),
    http.get(PAGE_URL.split('?')[0], () =>
      HttpResponse.html(
        options.html ??
          `<!doctype html><html><head>
            <title>Fallback title</title>
            <meta property="og:title" content="Tickets &amp; prices — Cloud Native Days" />
            <meta content="Early bird until 1 October." property="og:description" />
            <meta property="og:image" content="${OG_IMAGE_URL}" />
          </head><body></body></html>`,
      ),
    ),
    http.get(OG_IMAGE_URL, () =>
      HttpResponse.arrayBuffer(
        pngBytes(options.ogImageSize ?? 128).buffer as ArrayBuffer,
        {
          headers: { 'content-type': 'image/png' },
        },
      ),
    ),
  )
}

export function callsTo(recorded: Recorded, nsid: string) {
  return recorded.calls.filter((c) => c.nsid === nsid)
}
