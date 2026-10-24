/**
 * THE PHONE'S SIDE OF SUBMIT (Photo Wall spec §6.2, §6.3, §6.5).
 * Client-safe.
 *
 * One multipart request to `POST /wall/post/submit`. How an answer is read:
 *
 * - `200 { ok: true }`: the post is in.
 * - any `413`, Vercel's own included: a refusal, never a lost response.
 * - another `4xx { ok: false, refusal }`: a refusal; the route answers so
 *   only when it knows no post was created.
 * - anything else (a network error, a 5xx, a captive portal's HTML page): a
 *   LOST response. The post may be in, so it is retried with the SAME
 *   `uploadId`, which the route answers with success if it is (§6.2).
 */
import type { Crop } from './crop'

export const SUBMIT_PATH = '/wall/post/submit'

/** What a refusal was about (§6.3); `failed` is every other refusal. */
export type WallSubmitRefusal =
  'pendingDevice' | 'hourly' | 'pendingWall' | 'closed' | 'failed'

/** The phone's message for each refusal, as §6.3 words it. */
export const REFUSAL_MESSAGES: Record<WallSubmitRefusal, string> = {
  pendingDevice:
    'You have 3 photos waiting for approval. You can post again once an organizer has looked at one.',
  hourly: 'You’ve posted 10 photos in the last hour. Try again a bit later.',
  pendingWall:
    'Lots of photos are waiting right now. Try again in a few minutes.',
  closed: 'The wall isn’t open for photos right now.',
  failed: 'Something went wrong. Your photo wasn’t posted. Try again.',
}

const isRefusal = (value: unknown): value is WallSubmitRefusal =>
  typeof value === 'string' && Object.hasOwn(REFUSAL_MESSAGES, value)

/** A refused post, as `onSubmit` rejects with it: the message is §6.3's. */
export class WallPostRefused extends Error {
  constructor(readonly refusal: WallSubmitRefusal) {
    super(REFUSAL_MESSAGES[refusal])
    this.name = 'WallPostRefused'
  }
}

export interface WallPostRequest {
  uploadId: string
  photo: Blob
  caption: string
  name: string
  crop: Crop
  marketingConsent: boolean
}

export type WallPostAttempt =
  | { ok: true }
  | { ok: false; refusal: WallSubmitRefusal }
  /** No answer to go by: the post may be in. Retry with the same `uploadId`. */
  | { ok: false; lost: true }

const LOST = { ok: false, lost: true } as const

function submitBody(post: WallPostRequest): FormData {
  const body = new FormData()
  body.set('uploadId', post.uploadId)
  body.set('photo', post.photo, `${post.uploadId}.jpg`)
  body.set('caption', post.caption)
  body.set('name', post.name)
  body.set('cropX', String(post.crop.x))
  body.set('cropY', String(post.crop.y))
  body.set('marketingConsent', String(post.marketingConsent))
  return body
}

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** One request, and what its answer means. */
async function sendOnce(
  post: WallPostRequest,
  send: typeof fetch,
): Promise<WallPostAttempt> {
  let response: Response
  try {
    response = await send(SUBMIT_PATH, {
      method: 'POST',
      body: submitBody(post),
      credentials: 'same-origin',
    })
  } catch {
    return LOST
  }
  if (response.status === 413) return { ok: false, refusal: 'failed' }
  const body = (await jsonOf(response)) as {
    ok?: unknown
    refusal?: unknown
  } | null
  if (response.status === 200 && body?.ok === true) return { ok: true }
  if (
    response.status >= 400 &&
    response.status < 500 &&
    body?.ok === false &&
    isRefusal(body.refusal)
  ) {
    return { ok: false, refusal: body.refusal }
  }
  return LOST
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Waits before the 2nd and 3rd attempt: venue Wi-Fi drops for seconds. */
export const RETRY_DELAYS_MS = [1_000, 3_000]

/**
 * Post, retrying a lost response with the same `uploadId` (§6.5). Answers
 * the first success or refusal, or `lost` when every attempt was lost.
 */
export async function postToWall(
  post: WallPostRequest,
  {
    send = (...args) => fetch(...args),
    wait = sleep,
  }: { send?: typeof fetch; wait?: (ms: number) => Promise<void> } = {},
): Promise<WallPostAttempt> {
  let attempt = await sendOnce(post, send)
  for (const delay of RETRY_DELAYS_MS) {
    if (!('lost' in attempt)) break
    await wait(delay)
    attempt = await sendOnce(post, send)
  }
  return attempt
}
