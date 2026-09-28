import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { requireDocumentInCurrentOrg } from '@/server/tenancy'
import { readMarketingAssetGif } from '@/lib/marketing-asset/sanity'
import { originalFilename } from '@/lib/marketing-asset/original'

/** A GIF is at most 10 MB: relayed as it arrives, well inside this. */
export const maxDuration = 60

/** A published asset id: never a draft or a release version. */
const QuerySchema = z
  .object({ asset: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) })
  .strict()

const refused = () =>
  NextResponse.json({ error: 'GIF not found' }, { status: 404 })

/**
 * Only our own project and dataset's images on the Sanity CDN, over https on
 * the default port, WITHOUT parameters: any parameter makes the CDN re-encode.
 */
function isOurOriginal(raw: string): boolean {
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
    url.pathname.endsWith('.gif')
  )
}

/**
 * A gallery GIF's ORIGINAL bytes, as a download, to post by hand
 * (docs/MARKETING_ASSETS_SPEC.md §5). The CDN serves an image's original only
 * without parameters, and then inline — its `?dl=` goes through the image
 * pipeline and comes back re-encoded (measured, PR #1243) — and a browser
 * ignores `download` on a cross-origin link. So the bytes are relayed from
 * our own origin with an attachment header, unchanged and never buffered.
 *
 * Organizer of the owning organization only. A non-organizer, another
 * organization's id, a missing one and one that is not a GIF all get ONE
 * answer, each refused before anything is fetched.
 */
export async function GET(request: Request) {
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!parsed.success) return refused()
  const id = parsed.data.asset

  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) return refused()

  let gif: { title: string; url: string | null } | null
  try {
    const orgId = await requireDocumentInCurrentOrg(id, 'marketingAsset')
    gif = await readMarketingAssetGif(orgId, id)
  } catch {
    return refused()
  }
  if (!gif?.url || !isOurOriginal(gif.url)) return refused()

  // Aborted with the request: a closed tab stops the upstream read too.
  const upstream = await fetch(gif.url, {
    // The host check holds for the first hop only: never follow one.
    redirect: 'error',
    cache: 'no-store',
    signal: request.signal,
  }).catch(() => null)
  if (!upstream?.ok || !upstream.body)
    return NextResponse.json(
      { error: 'The GIF could not be fetched.' },
      { status: 502 },
    )
  const filename = originalFilename(gif.title, 'gif')
  const headers = new Headers({
    // Always a GIF, whatever the upstream said; sandboxed if rendered.
    'content-type': 'image/gif',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-security-policy': 'sandbox',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
  // fetch hands back a DECODED body when the upstream was compressed, so its
  // length then is not this body's.
  const length = upstream.headers.get('content-length')
  if (length && !upstream.headers.get('content-encoding'))
    headers.set('content-length', length)
  return new Response(upstream.body, { status: 200, headers })
}
