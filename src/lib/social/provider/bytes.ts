/**
 * Fetch an image the adapters upload as a blob: the Sanity CDN rendition, or
 * a page's `og:image` for a link card. Pure transport — the caller decides
 * what a failure means for the publish.
 */

export type ImageFetchFailure = 'unavailable' | 'not-an-image' | 'too-large'

export class ImageFetchError extends Error {
  constructor(
    readonly reason: ImageFetchFailure,
    readonly url: string,
    detail?: string,
  ) {
    super(`${reason}: ${url}${detail ? ` (${detail})` : ''}`)
    this.name = 'ImageFetchError'
  }
}

export interface ImageBytes {
  bytes: Uint8Array
  mimeType: string
}

/** Default budget for one fetch; Vercel's cron function is time-boxed. */
export const IMAGE_FETCH_TIMEOUT_MS = 15_000

/**
 * Read a body up to `maxBytes`, cancelling the stream the moment it goes
 * over — a missing or lying `Content-Length` must not let one response fill
 * the cron function's memory. Over the cap: `null`, or with `truncate` the
 * first `maxBytes` (an HTML page whose `<head>` came first is still useful).
 */
export async function readBounded(
  response: Response,
  maxBytes: number,
  options: { truncate?: boolean } = {},
): Promise<Uint8Array | null> {
  const body = response.body
  if (!body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength <= maxBytes) return bytes
    return options.truncate ? bytes.slice(0, maxBytes) : null
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (total + value.byteLength > maxBytes) {
        // Not awaited: some transports (MSW's interceptor among them) never
        // settle a cancel, and nothing downstream depends on it.
        reader.cancel().catch(() => {})
        if (!options.truncate) return null
        chunks.push(value.slice(0, maxBytes - total))
        total = maxBytes
        break
      }
      total += value.byteLength
      chunks.push(value)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // a pending cancel keeps the lock; the response is dropped anyway
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Downloads at most `maxBytes`. The declared `Content-Type` wins over the
 * caller's expectation when it is an image type: with `auto=format` the CDN
 * decides the encoding, and the blob's declared MIME must match its bytes.
 */
export async function fetchImageBytes(
  url: string,
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
  fallbackMimeType?: string,
): Promise<ImageBytes> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      headers: { accept: 'image/*' },
    })
  } catch (error) {
    throw new ImageFetchError(
      'unavailable',
      url,
      error instanceof Error ? error.message : String(error),
    )
  }
  if (!response.ok) {
    throw new ImageFetchError('unavailable', url, `HTTP ${response.status}`)
  }
  const declared = response.headers.get('content-type')?.split(';')[0].trim()
  const mimeType = declared?.startsWith('image/') ? declared : fallbackMimeType
  if (!mimeType) {
    throw new ImageFetchError(
      'not-an-image',
      url,
      declared ?? 'no content type',
    )
  }
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ImageFetchError('too-large', url, `${length} bytes`)
  }
  const bytes = await readBounded(response, maxBytes)
  if (!bytes) {
    throw new ImageFetchError('too-large', url, `over ${maxBytes} bytes`)
  }
  return { bytes, mimeType }
}
