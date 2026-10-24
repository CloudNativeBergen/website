import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * The consented ZIP export (Photo Wall spec §12, §13 P5): every approved Wall
 * Post whose contributor ticked marketing consent, read on the NON-CDN
 * client, so a consent unticked a moment ago is never exported from a CDN
 * answer that lags it.
 */

/**
 * THE export rule, one GROQ filter for the list, the count the admin page
 * shows and the re-check before each photo: a published Wall Post (a draft is
 * never one), approved, with marketing consent, whose photo asset exists.
 * `scopedFetch` leads it with the tenant predicate.
 */
const EXPORTABLE = `_type == "wallPost" && !(_id in path("drafts.**"))
  && status == "approved" && marketingConsent == true
  && defined(photo.asset->url)`

export interface ConsentedPhoto {
  _id: string
  /** The asset's original on Sanity's CDN, no image parameters. */
  url: string
  submittedAt: string | null
}

/**
 * How long one Sanity read of the export may take: the client's own
 * `timeout` doesn't bound a read, so each takes an `AbortSignal`.
 */
export const READ_TIMEOUT_MS = 15_000

/** This wall's exportable posts, newest approval first. */
export async function readConsentedPhotos(
  conferenceId: string,
  signal?: AbortSignal,
): Promise<ConsentedPhoto[]> {
  return scopedFetch<ConsentedPhoto[]>(
    clientReadUncached,
    { conferenceId },
    `*[${EXPORTABLE}] | order(approvedAt desc) {
      _id,
      "url": photo.asset->url,
      submittedAt
    }`,
    {},
    { signal },
  )
}

/** How long the admin page's count may take before it is left unknown. */
export const COUNT_TIMEOUT_MS = 3_000

/** How many photos the ZIP would hold now: the admin page's count. */
export async function countConsentedPhotos(
  conferenceId: string,
  signal?: AbortSignal,
): Promise<number> {
  return scopedFetch<number>(
    clientReadUncached,
    { conferenceId },
    `count(*[${EXPORTABLE}])`,
    {},
    { signal },
  )
}

/**
 * How long one photo may take, headers AND body, before the download fails:
 * 4 MiB in a minute is about 0.56 Mbit/s. The body is read as the browser
 * takes the ZIP, so a slower download hits it too.
 */
export const PHOTO_TIMEOUT_MS = 60_000

/**
 * Whether the post is still exportable, read live just before its photo is
 * fetched: one unticked, taken off the wall or deleted since the list was
 * read is not.
 */
export async function stillExportable(
  conferenceId: string,
  id: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const live = await scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId },
    `*[${EXPORTABLE} && _id == $id][0]._id`,
    { id },
    { signal },
  )
  return live === id
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
