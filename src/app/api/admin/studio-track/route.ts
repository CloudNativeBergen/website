import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { requireDocumentInCurrentOrg } from '@/server/tenancy'
import { readMarketingAssetTrack } from '@/lib/marketing-asset/sanity'
import { readVideoProjectTrack } from '@/lib/video-project/sanity'

/**
 * A studio video's music track, streamed from our own origin
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6). The Sanity CDN sends no CORS
 * header to tenant domains, so the editor cannot decode the file from there,
 * and the image proxy is images only, unstreamed, and under the platform's
 * response-size limit — a 20 MB track is not.
 *
 * `?asset=<id>` names a gallery track; `?project=<id>` a saved project's
 * track, which it holds even once its gallery entry is gone. Only an
 * organizer of the organization that owns it gets the file. A non-organizer,
 * another organization's id, a missing one and one that holds no track all
 * get ONE answer, and every one of them is refused before anything is
 * fetched — the tenancy guard, then our own read, then the file.
 */

const refused = () =>
  NextResponse.json({ error: 'Track not found' }, { status: 404 })

/** A published document id: never a draft or a release version. */
const ID = /^[A-Za-z0-9_-]{1,200}$/

/**
 * The only files this route relays: our own project and dataset's, on the
 * Sanity CDN, over https on the default port. The URL comes from our own
 * dataset, but a route that fetches must fail closed on anything else.
 */
function isOurTrackFile(raw: string): boolean {
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
    url.pathname.startsWith(`/files/${projectId}/${dataset}/`)
  )
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const asset = params.get('asset')
  const project = params.get('project')
  // Exactly one of the two, and a published id.
  const id = asset ?? project
  if ((asset && project) || !id || !ID.test(id)) return refused()

  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) return refused()

  let url: string | null
  try {
    const orgId = await requireDocumentInCurrentOrg(
      id,
      asset ? 'marketingAsset' : 'videoProject',
    )
    const track = asset
      ? await readMarketingAssetTrack(orgId, id)
      : await readVideoProjectTrack(orgId, id)
    url = track?.url ?? null
  } catch {
    return refused()
  }
  if (!url || !isOurTrackFile(url)) return refused()

  const upstream = await fetch(url, { cache: 'no-store' }).catch(() => null)
  if (!upstream?.ok || !upstream.body)
    return NextResponse.json(
      { error: 'The track could not be fetched.' },
      { status: 502 },
    )
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('content-length', length)
  // The body is passed through as it arrives, never buffered here.
  return new Response(upstream.body, { status: 200, headers })
}
