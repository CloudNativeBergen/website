import { NextResponse } from 'next/server'
import { makeZip } from 'client-zip'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForOrg, resolveCurrentOrgId } from '@/lib/authz/organizer'
import {
  EXPORT_FILENAME,
  exportEntryName,
  isOurPhotoOriginal,
  PHOTO_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  readConsentedPhotos,
  stillExportable,
  type ConsentedPhoto,
} from '@/lib/photo-wall/export'
import { liveConferenceInOrg } from '@/lib/photo-wall/tenant'

/**
 * Up to a few hundred photos of at most 4 MiB, relayed one at a time. The
 * longest every plan allows (Vercel: Hobby's maximum, Pro's default).
 */
export const maxDuration = 300

const refused = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/**
 * The request's conference, for an organizer of its organization only: the
 * same organization resolver as the other `/api/admin` routes and the same
 * live check as the `photoWall` router. Null refuses.
 */
async function organizerConferenceId(): Promise<string | null> {
  const session = await getAuthSession()
  // Signed out: refused before even the tenant read.
  if (!session?.speaker?._id) return null
  const orgId = await resolveCurrentOrgId()
  if (!isOrganizerForOrg(session.speaker, orgId)) return null
  return (await liveConferenceInOrg(orgId))?._id ?? null
}

/** Ends when the organizer cancels or after `ms`, whichever comes first. */
const deadline = (request: AbortSignal, ms: number) =>
  AbortSignal.any([request, AbortSignal.timeout(ms)])

/**
 * Each photo's original, fetched only when the ZIP is ready for it. Each post
 * is re-read live right before its photo is fetched: one unticked, taken off
 * the wall or deleted since the list was read (or while the photo before it
 * streamed) is skipped, as is one whose photo the CDN no longer has (404).
 * Any other failure, a photo that takes longer than {@link PHOTO_TIMEOUT_MS}
 * included, ends the stream with an error, so the download fails rather
 * than arrive with a consented photo silently left out.
 */
async function* entries(
  conferenceId: string,
  photos: ConsentedPhoto[],
  request: AbortSignal,
) {
  for (const photo of photos) {
    const exportable = await stillExportable(
      conferenceId,
      photo._id,
      deadline(request, READ_TIMEOUT_MS),
    ).catch((error: unknown) => {
      throw new Error(`Wall Post ${photo._id} could not be re-checked`, {
        cause: error,
      })
    })
    if (!exportable) continue
    // Bounds the headers AND the body: the body is read under this signal.
    const signal = deadline(request, PHOTO_TIMEOUT_MS)
    const upstream = await fetch(photo.url, {
      // The host check holds for the first hop only: never follow one.
      redirect: 'error',
      cache: 'no-store',
      signal,
    }).catch((error: unknown) => {
      throw signal.reason instanceof DOMException &&
        signal.reason.name === 'TimeoutError'
        ? new Error(`Photo ${photo._id} timed out`)
        : error
    })
    // Deleted between the re-check and this fetch.
    if (upstream.status === 404) {
      void upstream.body?.cancel()
      continue
    }
    if (!upstream.ok || !upstream.body)
      throw new Error(
        `Photo ${photo._id} could not be fetched (${upstream.status})`,
      )
    yield {
      name: exportEntryName(photo._id),
      lastModified: photo.submittedAt ?? undefined,
      input: upstream.body,
    }
  }
}

/**
 * The consented ZIP export (Photo Wall spec §12, §13 P5): every approved Wall
 * Post whose contributor ticked marketing consent, as one ZIP of the original
 * JPEGs. STREAMED: Vercel caps a buffered function response at 4.5 MB, and
 * streamed responses don't have that limit; each photo is fetched as the ZIP
 * reaches it, so memory holds about one photo whatever the count.
 *
 * Organizers of the conference's organization only, every refusal before
 * any Wall Post is read.
 */
export async function GET(request: Request) {
  let conferenceId: string | null
  try {
    conferenceId = await organizerConferenceId()
  } catch (error) {
    // An outage, not a refusal: logged, while the answer stays the one 404.
    console.error('Photo Wall export: could not check the organizer', error)
    return refused()
  }
  if (!conferenceId) return refused()

  let photos: ConsentedPhoto[]
  try {
    photos = await readConsentedPhotos(
      conferenceId,
      deadline(request.signal, READ_TIMEOUT_MS),
    )
  } catch (error) {
    console.error('Photo Wall export: could not read the photos', error)
    return NextResponse.json(
      { error: 'The photos could not be read.' },
      { status: 502 },
    )
  }
  if (photos.length === 0)
    return NextResponse.json(
      { error: 'No approved photos with marketing consent' },
      { status: 404 },
    )
  if (!photos.every((photo) => isOurPhotoOriginal(photo.url))) {
    console.error('Photo Wall export: a photo URL is not our CDN original')
    return NextResponse.json(
      { error: 'The photos could not be fetched.' },
      { status: 502 },
    )
  }

  const zip = makeZip(entries(conferenceId, photos, request.signal))
  return new Response(zip, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${EXPORT_FILENAME}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
