/**
 * THE PHONE'S SIDE OF SUBMIT (Photo Wall spec §6.2, §6.3, §6.5).
 * Client-safe.
 *
 * One multipart request to `POST /wall/post/submit`, as an `XMLHttpRequest`
 * for its upload progress. How an answer is read:
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
  | {
      ok: false
      refusal: WallSubmitRefusal
      /**
       * An earlier attempt of this post was lost: it may still land, so the
       * refusal proves nothing about it, and the `uploadId` must be kept.
       */
      earlierLost?: true
    }
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

/** What one attempt sends: the multipart body, and who hears its upload. */
export interface SendInit {
  body: FormData
  /** The share of the body uploaded so far, 0–1. */
  onUploadProgress?: (fraction: number) => void
}

/** One POST; resolves with the answer, rejects when there is none. */
export type Send = (url: string, init: SendInit) => Promise<Response>

/**
 * How long one attempt may take, upload and answer together: a 4 MiB photo
 * (the most the composer makes, §6.5) at about 400 kbit/s, a crowded venue
 * Wi-Fi's share, with room for the server's checks and upload to Sanity. A
 * connection that stalls past it is a lost response: retried with the same
 * `uploadId`, so a slow upload that did land converges on its post.
 */
export const ATTEMPT_TIMEOUT_MS = 90_000

/**
 * The POST as an `XMLHttpRequest`: `fetch` reports no upload progress
 * (§6.5). Same origin, so the `/wall` cookie goes with it. A network error,
 * a timeout or an abort rejects, as `fetch` would: a lost response.
 */
export const xhrSend: Send = (url, { body, onUploadProgress }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = ATTEMPT_TIMEOUT_MS
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress?.(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      try {
        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            headers: {
              'content-type': xhr.getResponseHeader('content-type') ?? '',
            },
          }),
        )
      } catch {
        // A status `Response` can't carry (0 and the like): no answer.
        reject(new TypeError(`Unusable answer (status ${xhr.status})`))
      }
    }
    xhr.onerror =
      xhr.ontimeout =
      xhr.onabort =
        () => reject(new TypeError('Network error'))
    xhr.send(body)
  })

/** One request, and what its answer means. */
async function sendOnce(
  post: WallPostRequest,
  send: Send,
  onProgress?: (fraction: number) => void,
): Promise<WallPostAttempt> {
  let response: Response
  try {
    onProgress?.(0)
    response = await send(SUBMIT_PATH, {
      body: submitBody(post),
      onUploadProgress: onProgress,
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

export interface PostOptions {
  /** The upload's progress, 0–1, from 0 again on each attempt. */
  onProgress?: (fraction: number) => void
  send?: Send
  wait?: (ms: number) => Promise<void>
}

/**
 * Post, retrying a lost response with the same `uploadId` (§6.5). Answers
 * the first success or refusal, or `lost` when every attempt was lost.
 */
export async function postToWall(
  post: WallPostRequest,
  { onProgress, send = xhrSend, wait = sleep }: PostOptions = {},
): Promise<WallPostAttempt> {
  let attempt = await sendOnce(post, send, onProgress)
  let earlierLost = false
  for (const delay of RETRY_DELAYS_MS) {
    if (!('lost' in attempt)) break
    earlierLost = true
    await wait(delay)
    attempt = await sendOnce(post, send, onProgress)
  }
  if (earlierLost && 'refusal' in attempt) {
    return { ...attempt, earlierLost: true }
  }
  return attempt
}
