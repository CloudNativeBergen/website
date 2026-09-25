import 'server-only'
import { Readable } from 'node:stream'
import { del } from '@vercel/blob'
import type { SanityImageAssetDocument } from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
import { blobStoreHost, checkMarketingAssetBlobUrl } from './blob-url'
import {
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  SNIFF_BYTES,
  sniffImageType,
} from './image-type'

export type MoveRefusal =
  'host' | 'prefix' | 'fetch' | 'type' | 'size' | 'upload'

export type MoveResult =
  | {
      ok: true
      asset: { _id: string; url: string; width: number; height: number }
    }
  | { ok: false; reason: MoveRefusal }

class TooLarge extends Error {}

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
 *     nothing stays in Blob. A delete that fails is left to the orphan sweeper.
 */
export async function moveBlobToSanity(
  url: string,
  orgId: string,
): Promise<MoveResult> {
  const check = checkMarketingAssetBlobUrl(url, orgId, blobStoreHost())
  if (!check.ok) return { ok: false, reason: check.reason }

  try {
    return await transfer(check.url, check.filename)
  } finally {
    try {
      await del(check.url)
    } catch (error) {
      console.error('Marketing asset: temporary blob not deleted', error)
    }
  }
}

async function transfer(url: string, filename: string): Promise<MoveResult> {
  let response: Response
  try {
    response = await fetch(url, { redirect: 'error', cache: 'no-store' })
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
    const asset = await uploadImageStream(Readable.from(counted()), {
      filename: displayFilename(filename),
      contentType: type,
    })
    const dimensions = asset.metadata?.dimensions
    return {
      ok: true,
      asset: {
        _id: asset._id,
        url: asset.url,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
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
 * handled — it hangs with the request half-sent. Through the observable API,
 * unsubscribing aborts the request, and the server sees it incomplete.
 */
function uploadImageStream(
  body: Readable,
  options: { filename: string; contentType: string },
): Promise<SanityImageAssetDocument> {
  return new Promise((resolve, reject) => {
    const subscription = clientWrite.observable.assets
      .upload('image', body, options)
      .subscribe({
        next: (event) => {
          if (event.type === 'response') resolve(event.body.document)
        },
        error: reject,
        complete: () =>
          reject(new Error('Sanity upload ended without a response')),
      })
    body.once('error', (error) => {
      subscription.unsubscribe()
      reject(error)
    })
  })
}

/** `marketing-asset-<org>-<ts>-logo-Xy12.png` → `logo-Xy12.png`. */
function displayFilename(pathname: string): string {
  const match = pathname.match(/-\d{13}-(.+)$/)
  return match?.[1] ?? pathname
}
