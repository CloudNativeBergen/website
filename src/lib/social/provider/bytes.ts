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
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) {
    throw new ImageFetchError('too-large', url, `${bytes.byteLength} bytes`)
  }
  return { bytes, mimeType }
}
