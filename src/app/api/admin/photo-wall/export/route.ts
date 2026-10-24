import { NextResponse } from 'next/server'
import { makeZip } from 'client-zip'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForOrg, resolveCurrentOrgId } from '@/lib/authz/organizer'
import {
  EXPORT_FILENAME,
  exportEntryName,
  isOurPhotoOriginal,
  readConsentedPhotos,
  RECHECK_BATCH,
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

/**
 * Each photo's original, fetched only when the ZIP is ready for it. Every
 * {@link RECHECK_BATCH} posts are re-read live first: one unticked, taken off
 * the wall or deleted since the list was read is skipped, as is one whose
 * photo the CDN no longer has. Any other failure ends the stream with an
 * error, so the download fails rather than arrive with a photo silently
 * left out.
 */
async function* entries(
  conferenceId: string,
  photos: ConsentedPhoto[],
  signal: AbortSignal,
) {
  for (let i = 0; i < photos.length; i += RECHECK_BATCH) {
    const batch = photos.slice(i, i + RECHECK_BATCH)
    const live = await stillExportable(
      conferenceId,
      batch.map((photo) => photo._id),
    )
    for (const photo of batch) {
      if (!live.has(photo._id)) continue
      const upstream = await fetch(photo.url, {
        // The host check holds for the first hop only: never follow one.
        redirect: 'error',
        cache: 'no-store',
        signal,
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

  const photos = await readConsentedPhotos(conferenceId)
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
