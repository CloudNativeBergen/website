import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * The consented ZIP export (Photo Wall spec §12, §13 P5): every approved Wall
 * Post whose contributor ticked marketing consent, read on the NON-CDN
 * client, so a consent unticked a moment ago is never exported from a CDN
 * answer that lags it.
 */

export interface ConsentedPhoto {
  _id: string
  /** The asset's original on Sanity's CDN, no image parameters. */
  url: string
  submittedAt: string | null
}

/** This wall's approved, consented posts with a photo, newest approval first. */
export async function readConsentedPhotos(
  conferenceId: string,
): Promise<ConsentedPhoto[]> {
  const rows = await scopedFetch<
    { _id: string; url: string | null; submittedAt: string | null }[]
  >(
    clientReadUncached,
    { conferenceId },
    // Published posts only: a draft is never a Wall Post.
    `*[_type == "wallPost" && !(_id in path("drafts.**"))
      && status == "approved" && marketingConsent == true]
      | order(approvedAt desc) {
        _id,
        "url": photo.asset->url,
        submittedAt
      }`,
  )
  return rows.flatMap(({ _id, url, submittedAt }) =>
    url ? [{ _id, url, submittedAt: submittedAt ?? null }] : [],
  )
}

/** The name the ZIP downloads as. */
export const EXPORT_FILENAME = 'photo-wall-marketing.zip'

/** `wallPost-<uploadId>` → `<uploadId>.jpg`: unique, and names the post. */
export function exportEntryName(postId: string): string {
  return `${postId.replace(/^wallPost-/, '')}.jpg`
}

/**
 * Only our own project and dataset's JPEG originals on the Sanity CDN, over
 * https on the default port, without parameters (any parameter makes the CDN
 * re-encode): the route fetches nothing else.
 */
export function isOurPhotoOriginal(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
  return (
    !!projectId &&
    !!dataset &&
    url.protocol === 'https:' &&
    url.hostname === 'cdn.sanity.io' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname.startsWith(`/images/${projectId}/${dataset}/`) &&
    url.pathname.endsWith('.jpg')
  )
}
