import 'server-only'
import { Readable } from 'node:stream'
import { abortAfter, deleteBlobWithin } from './blob-delete'
import { after } from 'next/server'
import type {
  SanityAssetDocument,
  SanityImageAssetDocument,
} from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
import { blobStoreHost, checkMarketingAssetBlobUrl } from './blob-url'
import {
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  SANITY_UPLOAD_DEADLINE_MS,
  SNIFF_BYTES,
  sniffImageType,
} from './image-type'
import {
  MARKETING_ASSET_MAX_AUDIO_BYTES,
  MARKETING_ASSET_MAX_AUDIO_SECONDS,
  type MarketingAssetAudioType,
} from './audio-type'
import { measureAudio } from './audio-measure'

export type MoveRefusal =
  | 'host'
  | 'prefix'
  | 'fetch'
  | 'type'
  | 'size'
  | 'length'
  | 'unreadable'
  | 'wav-format'
  | 'upload'

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

export type AudioMoveResult =
  | {
      ok: true
      asset: {
        _id: string
        url: string
        mimeType: MarketingAssetAudioType
        durationSeconds: number
        /** As for an image: false when Sanity handed back bytes it held. */
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
  const check = claimBlob(url, orgId)
  if (!check.ok) return check
  return transfer(check.url, check.filename, Date.now())
}

/**
 * Delete an upload the route refused before moving it (no rights
 * confirmation, no alt text, a foreign subject): the form uploads afresh on
 * every submit, so nothing will ever move this blob. Under the same URL check
 * as a move — a URL that is not ours is neither fetched nor deleted.
 */
export function discardBlob(url: string, orgId: string): void {
  claimBlob(url, orgId)
}

/**
 * Steps 1 and 4 of the move, for every kind: refuse a URL that is not ours
 * without a request, and once it is, delete the blob after the response
 * whatever else happens.
 */
function claimBlob(
  url: string,
  orgId: string,
):
  | { ok: true; url: string; filename: string }
  | { ok: false; reason: MoveRefusal } {
  const check = checkMarketingAssetBlobUrl(url, orgId, blobStoreHost())
  if (!check.ok) return { ok: false, reason: check.reason }
  const blobUrl = check.url
  after(async () => {
    try {
      await deleteBlobWithin(blobUrl, BLOB_DELETE_DEADLINE_MS)
    } catch (error) {
      console.error('Marketing asset: temporary blob not deleted', error)
    }
  })
  return check
}

/**
 * Move one uploaded audio track from Vercel Blob into a Sanity FILE asset
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6), under the same URL check, blob
 * delete and deadline as an image. Unlike an image it is read WHOLE before
 * anything is uploaded, because its length can only be measured from the
 * complete file and a track over ten minutes must never reach Sanity; the
 * read is counted and stops past 20 MB, so that is all it can ever hold.
 * The format is sniffed from the bytes and the length measured from them;
 * nothing the client said about the file is consulted.
 */
export async function moveAudioBlobToSanity(
  url: string,
  orgId: string,
): Promise<AudioMoveResult> {
  const check = claimBlob(url, orgId)
  if (!check.ok) return check
  const startedAt = Date.now()
  const deadline = abortAfter(SANITY_UPLOAD_DEADLINE_MS)
  try {
    return await transferAudio(
      check.url,
      check.filename,
      startedAt,
      deadline.signal,
    )
  } finally {
    deadline.clear()
  }
}

async function transferAudio(
  url: string,
  filename: string,
  startedAt: number,
  signal: AbortSignal,
): Promise<AudioMoveResult> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
  } catch {
    return { ok: false, reason: 'fetch' }
  }
  if (!response.ok || !response.body) return { ok: false, reason: 'fetch' }
  const reader = response.body.getReader()
  const drop = () => void reader.cancel().catch(() => {})
  if (
    Number(response.headers.get('content-length')) >
    MARKETING_ASSET_MAX_AUDIO_BYTES
  ) {
    drop()
    return { ok: false, reason: 'size' }
  }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MARKETING_ASSET_MAX_AUDIO_BYTES) {
        drop()
        return { ok: false, reason: 'size' }
      }
      chunks.push(value)
    }
  } catch {
    drop()
    return { ok: false, reason: 'fetch' }
  }
  const bytes = concat(chunks)
  // Format sniffed and length measured from the bytes, in one place.
  const measured = await measureAudio(bytes)
  if ('refused' in measured) return { ok: false, reason: measured.refused }
  const { type } = measured
  if (measured.durationSeconds > MARKETING_ASSET_MAX_AUDIO_SECONDS)
    return { ok: false, reason: 'length' }

  try {
    const asset = await uploadAssetStream(
      'file',
      Readable.from([
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      ]),
      { filename: displayFilename(filename), contentType: type },
      Math.max(0, startedAt + SANITY_UPLOAD_DEADLINE_MS - Date.now()),
    )
    return {
      ok: true,
      asset: {
        _id: asset._id,
        url: asset.url,
        mimeType: type,
        durationSeconds: measured.durationSeconds,
        created:
          Date.parse(asset._createdAt) >= startedAt - CREATED_CLOCK_SKEW_MS,
      },
    }
  } catch (error) {
    console.error('Marketing asset: track upload to Sanity failed', error)
    return { ok: false, reason: 'upload' }
  }
}

async function transfer(
  url: string,
  filename: string,
  startedAt: number,
): Promise<MoveResult> {
  const deadlineAt = startedAt + SANITY_UPLOAD_DEADLINE_MS
  // One deadline for the fetch, the read and the upload. Aborting the fetch
  // also errors the body mid-upload, which aborts the upload.
  const fetchDeadline = abortAfter(SANITY_UPLOAD_DEADLINE_MS)
  try {
    return await transferWithin(
      url,
      filename,
      startedAt,
      deadlineAt,
      fetchDeadline.signal,
    )
  } finally {
    fetchDeadline.clear()
  }
}

async function transferWithin(
  url: string,
  filename: string,
  startedAt: number,
  deadlineAt: number,
  signal: AbortSignal,
): Promise<MoveResult> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'error',
      cache: 'no-store',
      signal,
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
    const asset = await uploadAssetStream(
      'image',
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
 * Upload a Node stream as a Sanity image or file asset, ABORTING the request when the stream
 * fails. Measured against the real `@sanity/client` (7.x) and a local server:
 * the promise API neither listens for a body stream's `error` (an unhandled
 * `error` event takes the process down) nor ends the request when one is
 * handled — it hangs with the request half-sent. `move.real-client.test.ts`
 * holds that measurement in CI. Through the observable API,
 * unsubscribing aborts the request, and the server sees it incomplete.
 */
function uploadAssetStream(
  kind: 'image',
  body: Readable,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityImageAssetDocument>
function uploadAssetStream(
  kind: 'file',
  body: Readable,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityAssetDocument>
function uploadAssetStream(
  kind: 'image' | 'file',
  body: Readable,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityAssetDocument> {
  return new Promise((resolve, reject) => {
    // Declared before subscribing: the client can fail synchronously INSIDE
    // subscribe, and that error handler must be able to clear it.
    const deadline: { timer?: ReturnType<typeof setTimeout> } = {}
    // Settled once, by whichever path gets there first; each clears the
    // deadline.
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(deadline.timer)
      fn()
    }
    const subscription = clientWrite.observable.assets
      .upload(kind, body, options)
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
    deadline.timer = setTimeout(() => {
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
