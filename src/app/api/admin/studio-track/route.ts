import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { requireDocumentInCurrentOrg } from '@/server/tenancy'
import { readMarketingAssetTrack } from '@/lib/marketing-asset/sanity'
import { readVideoProjectTrack } from '@/lib/video-project/sanity'
import { trackSourceSchema } from '@/lib/video-project/track-source'

/**
 * A studio video's music track, streamed from our own origin
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6). The Sanity CDN sends no CORS
 * header to tenant domains, so the editor cannot decode the file from there,
 * and the image proxy is images only, unstreamed, and under the platform's
 * response-size limit — a 20 MB track is not.
 *
 * `?asset=<id>` names a gallery track; `?project=<id>&file=<file id>` the
 * file a saved project holds — even once its gallery entry is gone — and
 * only while it still holds THAT file: one another organizer has since
 * replaced is refused, never served as though it were the one loaded. Only an
 * organizer of the organization that owns it gets the file. A non-organizer,
 * another organization's id, a missing one and one that holds no track all
 * get ONE answer, and every one of them is refused before anything is
 * fetched — the tenancy guard, then our own read, then the file.
 */

const refused = () =>
  NextResponse.json({ error: 'Track not found' }, { status: 404 })

/** What a track is sent as: its own audio type, else plain bytes. */
function audioType(upstream: string | null): string {
  const type = upstream?.split(';')[0].trim().toLowerCase() ?? ''
  return /^audio\/[a-z0-9.+-]+$/.test(type) ? type : 'application/octet-stream'
}

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
  // Exactly one source, of published ids.
  const parsed = trackSourceSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!parsed.success) return refused()
  const source = parsed.data

  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) return refused()

  let url: string | null
  // Which file is sent, so the editor knows what it decoded: a gallery
  // entry's file can be replaced at any time.
  let fileId: string | null
  try {
    if ('asset' in source) {
      const orgId = await requireDocumentInCurrentOrg(
        source.asset,
        'marketingAsset',
      )
      const held = await readMarketingAssetTrack(orgId, source.asset)
      url = held?.url ?? null
      fileId = held?.fileId ?? null
    } else {
      const orgId = await requireDocumentInCurrentOrg(
        source.project,
        'videoProject',
      )
      const held = await readVideoProjectTrack(orgId, source.project)
      url = held?.fileId === source.file ? (held.url ?? null) : null
      fileId = source.file
    }
  } catch {
    return refused()
  }
  if (!url || !fileId || !isOurTrackFile(url)) return refused()

  // Aborted with the request: a closed tab stops the upstream read too.
  const upstream = await fetch(url, {
    cache: 'no-store',
    signal: request.signal,
  }).catch(() => null)
  if (!upstream?.ok || !upstream.body)
    return NextResponse.json(
      { error: 'The track could not be fetched.' },
      { status: 502 },
    )
  const headers = new Headers({
    // Only ever audio or bytes, never anything a browser would render — and
    // sandboxed if one tried.
    'content-type': audioType(upstream.headers.get('content-type')),
    'content-security-policy': 'sandbox',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-track-file': fileId,
  })
  // fetch hands back a DECODED body when the upstream was compressed, so its
  // length then is not this body's.
  const length = upstream.headers.get('content-length')
  if (length && !upstream.headers.get('content-encoding'))
    headers.set('content-length', length)
  // The body is passed through as it arrives, never buffered here.
  return new Response(upstream.body, { status: 200, headers })
}
