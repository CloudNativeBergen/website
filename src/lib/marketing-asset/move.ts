import 'server-only'
import { abortAfter, deleteBlobWithin } from './blob-delete'
import { after } from 'next/server'
import type {
  SanityAssetDocument,
  SanityImageAssetDocument,
} from '@sanity/client'
import { uploadAssetStream } from './sanity-upload'
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
import {
  MARKETING_ASSET_GIF_TYPE,
  MARKETING_ASSET_MAX_GIF_BYTES,
  MARKETING_ASSET_MAX_VIDEO_BYTES,
  MARKETING_ASSET_VIDEO_TYPE,
  MOTION_SNIFF_BYTES,
  isGif,
  isMp4,
} from './motion-type'

/**
 * How long a video's move may take: inside the move route's `maxDuration`
 * (300 s), with room left for the poster, the gallery write and the answer.
 * A 100 MiB file took about 9 s from a laptop to Sanity (PR #1243).
 */
export const VIDEO_UPLOAD_DEADLINE_MS = 240_000

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

export type VideoMoveResult =
  | {
      ok: true
      asset: {
        _id: string
        url: string
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
  return imageResult(await transfer(check.url, check.filename, IMAGE))
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
      bytes,
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

/**
 * What one streamed move accepts: which Sanity asset it becomes, the most
 * bytes it may carry, how its real type is read from its first bytes, and how
 * long the whole move may take.
 */
interface StreamedKind {
  asset: 'image' | 'file'
  maxBytes: number
  sniffBytes: number
  sniff: (head: Uint8Array) => string | null
  deadlineMs: number
}

const IMAGE: StreamedKind = {
  asset: 'image',
  maxBytes: MARKETING_ASSET_MAX_IMAGE_BYTES,
  sniffBytes: SNIFF_BYTES,
  sniff: sniffImageType,
  deadlineMs: SANITY_UPLOAD_DEADLINE_MS,
}

const GIF: StreamedKind = {
  asset: 'image',
  maxBytes: MARKETING_ASSET_MAX_GIF_BYTES,
  sniffBytes: MOTION_SNIFF_BYTES,
  sniff: (head) => (isGif(head) ? MARKETING_ASSET_GIF_TYPE : null),
  deadlineMs: SANITY_UPLOAD_DEADLINE_MS,
}

const VIDEO: StreamedKind = {
  asset: 'file',
  maxBytes: MARKETING_ASSET_MAX_VIDEO_BYTES,
  sniffBytes: MOTION_SNIFF_BYTES,
  sniff: (head) => (isMp4(head) ? MARKETING_ASSET_VIDEO_TYPE : null),
  deadlineMs: VIDEO_UPLOAD_DEADLINE_MS,
}

type StreamedResult =
  | { ok: true; document: SanityAssetDocument; created: boolean }
  | { ok: false; reason: MoveRefusal }

function imageResult(moved: StreamedResult): MoveResult {
  if (!moved.ok) return moved
  const dimensions = (moved.document as SanityImageAssetDocument).metadata
    ?.dimensions
  return {
    ok: true,
    asset: {
      _id: moved.document._id,
      url: moved.document.url,
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      created: moved.created,
    },
  }
}

/**
 * Move one uploaded GIF (spec §4.1) into a Sanity IMAGE asset, as an image
 * moves: same URL check, blob delete and deadline, the type sniffed from the
 * bytes (`GIF87a`/`GIF89a`) and the stream counted against 10 MB. Sanity keeps
 * the original bytes; only its renditions are re-encoded.
 */
export async function moveGifBlobToSanity(
  url: string,
  orgId: string,
): Promise<MoveResult> {
  const check = claimBlob(url, orgId)
  if (!check.ok) return check
  return imageResult(await transfer(check.url, check.filename, GIF))
}

/**
 * Move one uploaded MP4 (spec §4.1) into a Sanity FILE asset. It STREAMS: the
 * blob's web stream is read chunk by chunk through the byte counter into a
 * Node stream the Sanity client sends as it arrives, so the function never
 * holds the file — only the chunk in flight. Refused, without a byte reaching
 * Sanity, when the first box is not an MP4 `ftyp` (a QuickTime `.mov` says
 * `qt  `); aborted mid-upload the moment it passes 100 MB. It gives up after
 * `deadlineMs` — the caller passes what is left of its `maxDuration` less
 * what the write and the answer need — and never after
 * {@link VIDEO_UPLOAD_DEADLINE_MS}.
 */
export async function moveVideoBlobToSanity(
  url: string,
  orgId: string,
  deadlineMs: number = VIDEO_UPLOAD_DEADLINE_MS,
): Promise<VideoMoveResult> {
  const check = claimBlob(url, orgId)
  if (!check.ok) return check
  const moved = await transfer(check.url, check.filename, {
    ...VIDEO,
    deadlineMs: Math.max(0, Math.min(deadlineMs, VIDEO_UPLOAD_DEADLINE_MS)),
  })
  if (!moved.ok) return moved
  return {
    ok: true,
    asset: {
      _id: moved.document._id,
      url: moved.document.url,
      created: moved.created,
    },
  }
}

async function transfer(
  url: string,
  filename: string,
  kind: StreamedKind,
): Promise<StreamedResult> {
  const startedAt = Date.now()
  const deadlineAt = startedAt + kind.deadlineMs
  // One deadline for the fetch, the read and the upload. Aborting the fetch
  // also errors the body mid-upload, which aborts the upload.
  const fetchDeadline = abortAfter(kind.deadlineMs)
  try {
    return await transferWithin(
      url,
      filename,
      kind,
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
  kind: StreamedKind,
  startedAt: number,
  deadlineAt: number,
  signal: AbortSignal,
): Promise<StreamedResult> {
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

  if (Number(response.headers.get('content-length')) > kind.maxBytes) {
    drop()
    return { ok: false, reason: 'size' }
  }

  // Peek at the first bytes to learn the real type before uploading anything.
  const head: Uint8Array[] = []
  let headBytes = 0
  try {
    while (headBytes < kind.sniffBytes) {
      const { done, value } = await reader.read()
      if (done) break
      head.push(value)
      headBytes += value.length
    }
  } catch {
    drop()
    return { ok: false, reason: 'fetch' }
  }
  const type = kind.sniff(concat(head))
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
      if (total > kind.maxBytes) {
        tooLarge = true
        drop()
        throw new TooLarge()
      }
      return chunk
    }
    for (const chunk of head) yield pass(chunk)
    // The peeked chunks are sent; nothing keeps them past that.
    head.length = 0
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
    const document = await uploadAssetStream(
      kind.asset,
      pulledFrom(counted()),
      { filename: displayFilename(filename), contentType: type },
      Math.max(0, deadlineAt - Date.now()),
    )
    return {
      ok: true,
      document,
      created:
        Date.parse(document._createdAt) >= startedAt - CREATED_CLOCK_SKEW_MS,
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
 * A web stream that pulls the next chunk only when the upload asks for one,
 * so backpressure reaches the blob. A chunk that throws (the byte counter's
 * cap, a failed read) errors the stream, which aborts the upload.
 */
function pulledFrom(
  chunks: AsyncGenerator<Uint8Array>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })
}

/** `marketing-asset/<org>/<ts>-logo-Xy12.png` → `logo-Xy12.png`. */
function displayFilename(pathname: string): string {
  const match = pathname.match(/\/\d{13}-(.+)$/)
  return match?.[1] ?? pathname
}
