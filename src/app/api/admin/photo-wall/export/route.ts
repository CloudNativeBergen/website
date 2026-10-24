import { NextResponse } from 'next/server'
import { makeZip } from 'client-zip'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForOrg } from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  EXPORT_FILENAME,
  exportEntryName,
  isOurPhotoOriginal,
  readConsentedPhotos,
  type ConsentedPhoto,
} from '@/lib/photo-wall/export'

/**
 * Up to a few hundred photos of at most 4 MiB, relayed one at a time. The
 * longest every plan allows (Vercel: Hobby's maximum, Pro's default).
 */
export const maxDuration = 300

const refused = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/**
 * The request's conference, for an organizer of its organization only: the
 * same rule as the `adminProcedure` waist and `photoWall`'s live check. The
 * tenant comes from the domain, never from the request; the live document
 * must still be that conference, in the organization the caller organizes.
 */
async function organizerConferenceId(): Promise<string | null> {
  try {
    const session = await getAuthSession()
    const { conference: tenant } = await getConferenceForCurrentDomain()
    const orgId = tenant?.organization?._ref ?? null
    if (!tenant?._id || !isOrganizerForOrg(session?.speaker, orgId)) return null
    const { conference: live, error } = await getConferenceForCurrentDomain({
      uncached: true,
    })
    if (error || live?._id !== tenant._id || live.organization?._ref !== orgId)
      return null
    return tenant._id
  } catch {
    return null
  }
}

/**
 * Each photo's original, fetched only when the ZIP is ready for it. A photo
 * that can't be fetched ends the stream with an error, so the download fails
 * rather than arrive with a photo silently left out.
 */
async function* entries(photos: ConsentedPhoto[], signal: AbortSignal) {
  for (const photo of photos) {
    const upstream = await fetch(photo.url, {
      // The host check holds for the first hop only: never follow one.
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
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
  const conferenceId = await organizerConferenceId()
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

  const zip = makeZip(entries(photos, request.signal))
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
