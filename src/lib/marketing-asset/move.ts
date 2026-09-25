import 'server-only'
import { Readable } from 'node:stream'
import { del } from '@vercel/blob'
import { after } from 'next/server'
import type { SanityImageAssetDocument } from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
import { blobStoreHost, checkMarketingAssetBlobUrl } from './blob-url'
import {
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  SANITY_UPLOAD_DEADLINE_MS,
  SNIFF_BYTES,
  sniffImageType,
} from './image-type'

export type MoveRefusal =
  'host' | 'prefix' | 'fetch' | 'type' | 'size' | 'upload'

export type MoveResult =
  | {
      ok: true
      asset: {
        _id: string
        url: string
        width: number
        height: number
        /**
         * False when Sanity already held these exact bytes (assets are
         * deduplicated by content hash) and handed back an existing asset,
         * which may be another tenant's. Only a created asset is ever the
         * gallery's to delete.
         */
        created: boolean
      }
    }
  | { ok: false; reason: MoveRefusal }

class TooLarge extends Error {}

/** How long the blob delete may take, retries included, once it runs. */
const BLOB_DELETE_DEADLINE_MS = 10_000

/**
 * Slack for clock skew between this server and Sanity when deciding whether an
 * asset was created by this upload or already existed.
 */
const CREATED_CLOCK_SKEW_MS = 5_000

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Move one uploaded image from Vercel Blob into a Sanity image asset (spec
 * §4.1), for the organization `orgId` resolved server-side.
 *
 * ORDER IS THE GUARANTEE:
 *  1. The URL is checked against our store's host and this organization's
 *     prefix. A refusal here makes NO request — no fetch, and no delete, since
 *     a URL we do not own is not ours to delete.
 *  2. The blob is fetched without following redirects, and refused when its
 *     declared size is over the limit or its first bytes are not PNG, JPEG or
 *     WebP. The client's claimed type is never consulted.
 *  3. The body streams into Sanity through a byte counter that aborts the
 *     upload the moment it passes the limit, so a lying `content-length` cannot
 *     smuggle a larger file through and nothing is held whole in memory.
 *  4. Once the URL has passed step 1, the blob is deleted whatever happened:
 *     nothing stays in Blob. The delete runs AFTER the response (`after()`),
 *     bounded, because `@vercel/blob` retries a failing call up to ten times
 *     with growing waits: awaited here, it could push the route past its
 *     `maxDuration` after the image was stored and before the gallery entry
 *     was written. A delete that fails is left to the orphan sweeper.
 *  5. The whole move shares one deadline: the fetch, the read and the upload.
 */
export async function moveBlobToSanity(
  url: string,
  orgId: string,
): Promise<MoveResult> {
  const check = checkMarketingAssetBlobUrl(url, orgId, blobStoreHost())
  if (!check.ok) return { ok: false, reason: check.reason }

  const blobUrl = check.url
  after(async () => {
    try {
      await del(blobUrl, {
        abortSignal: AbortSignal.timeout(BLOB_DELETE_DEADLINE_MS),
      })
    } catch (error) {
      console.error('Marketing asset: temporary blob not deleted', error)
    }
  })
  return transfer(blobUrl, check.filename, Date.now())
}

async function transfer(
  url: string,
  filename: string,
  startedAt: number,
): Promise<MoveResult> {
  const deadlineAt = startedAt + SANITY_UPLOAD_DEADLINE_MS
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'error',
      cache: 'no-store',
      // Aborting also errors the body mid-upload, which aborts the upload.
      signal: AbortSignal.timeout(SANITY_UPLOAD_DEADLINE_MS),
    })
  } catch {
    return { ok: false, reason: 'fetch' }
  }
  if (!response.ok || !response.body) return { ok: false, reason: 'fetch' }

  const reader = response.body.getReader()
  // Never awaited: a cancel may not settle, and the answer does not wait on it.
  const drop = () => void reader.cancel().catch(() => {})

  if (
    Number(response.headers.get('content-length')) >
    MARKETING_ASSET_MAX_IMAGE_BYTES
  ) {
    drop()
    return { ok: false, reason: 'size' }
  }

  // Peek at the first bytes to learn the real type before uploading anything.
  const head: Uint8Array[] = []
  let headBytes = 0
  try {
    while (headBytes < SNIFF_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      head.push(value)
      headBytes += value.length
    }
  } catch {
    drop()
    return { ok: false, reason: 'fetch' }
  }
  const type = sniffImageType(concat(head))
  if (!type) {
    drop()
    return { ok: false, reason: 'type' }
  }

  let tooLarge = false
  let readFailed = false
  async function* counted() {
    let total = 0
    const pass = (chunk: Uint8Array) => {
      total += chunk.length
      if (total > MARKETING_ASSET_MAX_IMAGE_BYTES) {
        tooLarge = true
        drop()
        throw new TooLarge()
      }
      return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    }
    for (const chunk of head) yield pass(chunk)
    while (true) {
      let next: ReadableStreamReadResult<Uint8Array>
      try {
        next = await reader.read()
      } catch (error) {
        readFailed = true
        throw error
      }
      if (next.done) return
      yield pass(next.value)
    }
  }

  try {
    const asset = await uploadImageStream(
      Readable.from(counted()),
      { filename: displayFilename(filename), contentType: type },
      Math.max(0, deadlineAt - Date.now()),
    )
    const dimensions = asset.metadata?.dimensions
    return {
      ok: true,
      asset: {
        _id: asset._id,
        url: asset.url,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
        created:
          Date.parse(asset._createdAt) >= startedAt - CREATED_CLOCK_SKEW_MS,
      },
    }
  } catch (error) {
    // Whatever failed, stop reading the blob: nobody will consume the rest.
    drop()
    if (tooLarge) return { ok: false, reason: 'size' }
    if (readFailed) return { ok: false, reason: 'fetch' }
    console.error('Marketing asset: upload to Sanity failed', error)
    return { ok: false, reason: 'upload' }
  }
}

/**
 * Upload a Node stream as a Sanity image, ABORTING the request when the stream
 * fails. Measured against the real `@sanity/client` (7.x) and a local server:
 * the promise API neither listens for a body stream's `error` (an unhandled
 * `error` event takes the process down) nor ends the request when one is
 * handled — it hangs with the request half-sent. `move.real-client.test.ts`
 * holds that measurement in CI. Through the observable API,
 * unsubscribing aborts the request, and the server sees it incomplete.
 */
function uploadImageStream(
  body: Readable,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityImageAssetDocument> {
  return new Promise((resolve, reject) => {
    // Declared before subscribing: the client can fail synchronously INSIDE
    // subscribe, and that error handler must be able to clear it.
    let deadline: ReturnType<typeof setTimeout> | undefined
    // Settled once, by whichever path gets there first; each clears the
    // deadline.
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      fn()
    }
    const subscription = clientWrite.observable.assets
      .upload('image', body, options)
      .subscribe({
        next: (event) => {
          if (event.type === 'response')
            finish(() => resolve(event.body.document))
        },
        error: (error) => finish(() => reject(error)),
        complete: () =>
          finish(() =>
            reject(new Error('Sanity upload ended without a response')),
          ),
      })
    if (settled) return
    body.once('error', (error) => {
      subscription.unsubscribe()
      finish(() => reject(error))
    })
    // The client sets NO timeout of its own (`timeout: 0`). Give up well
    // before the route's `maxDuration`, so the blob delete and the answer
    // still run instead of the function being killed mid-request.
    deadline = setTimeout(() => {
      subscription.unsubscribe()
      body.destroy()
      finish(() => reject(new Error('Sanity upload timed out')))
    }, timeoutMs)
  })
}

/** `marketing-asset/<org>/<ts>-logo-Xy12.png` → `logo-Xy12.png`. */
function displayFilename(pathname: string): string {
  const match = pathname.match(/\/\d{13}-(.+)$/)
  return match?.[1] ?? pathname
}
