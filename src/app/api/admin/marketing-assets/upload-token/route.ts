import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import {
  isOrganizerForCurrentOrg,
  resolveCurrentOrgId,
} from '@/lib/authz/organizer'
import { isMarketingAssetPathname } from '@/lib/marketing-asset/blob-url'
import {
  MARKETING_ASSET_IMAGE_TYPES,
  MARKETING_ASSET_MAX_IMAGE_BYTES,
} from '@/lib/marketing-asset/image-type'

/** A token lives long enough for one upload to start, and no longer. */
const TOKEN_LIFETIME_MS = 10 * 60 * 1000

/**
 * The short-lived Vercel Blob client token for a marketing asset upload
 * (docs/MARKETING_ASSETS_SPEC.md §4.1). REST, not tRPC, because
 * `@vercel/blob/client`'s `upload()` calls a plain route with `handleUpload()`.
 *
 * Organizer of the request host's organization only, checked before the body
 * is read. The token is bound to a pathname under THIS organization's
 * `marketing-asset-<orgId>-` prefix, to PNG/JPEG/WebP and to the size cap. The
 * move re-checks all of it from the file itself: this is the first gate, not
 * the only one. No upload-completed callback is registered — the browser hands
 * the URL to the move, and an abandoned upload is the orphan sweeper's.
 */
export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const orgId = await resolveCurrentOrgId()
        if (!orgId || !isMarketingAssetPathname(pathname, orgId)) {
          throw new Error('Invalid pathname for a marketing asset')
        }
        return {
          allowedContentTypes: [...MARKETING_ASSET_IMAGE_TYPES],
          maximumSizeInBytes: MARKETING_ASSET_MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
        }
      },
    })
    return NextResponse.json(json)
  } catch (error) {
    console.error('Marketing asset upload token refused', error)
    return NextResponse.json(
      { error: 'Could not start the upload.' },
      { status: 400 },
    )
  }
}
