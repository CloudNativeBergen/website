import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { clientWrite } from '@/lib/sanity/client'
import {
  RICH_TEXT_IMAGE_MIME_TYPES,
  SANITY_IMAGE_REF_PATTERN,
} from '@/lib/homepage/richText'

/**
 * Upload an image for a homepage Rich Text block.
 *
 * The block can only reference an asset that is already in OUR dataset (see
 * `SANITY_IMAGE_REF_PATTERN`), so this is the only way to get an image into one
 * — which is the point: an organizer-entered remote image URL would be a
 * tracking and exfiltration beacon fired at every reader of the page.
 *
 * Three gates, in order of authority:
 *   1. organizer of the CURRENT domain's org (never trust a client-sent tenant)
 *   2. a declared MIME type on the raster allowlist — notably NOT `image/svg+xml`,
 *      because an SVG is an active document Sanity's CDN serves as-is
 *   3. the asset id Sanity hands back must itself match the render-side pattern.
 *      Sanity derives that id from the DECODED bytes, so a file that lied about
 *      its type fails here even though it passed gate 2. This is the real gate;
 *      the other two exist to give a clear error instead of a mystery.
 */
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const session = await getAuthSession()
    if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The ceiling below can only be enforced on a body that survived parsing.
    // A file over the platform's own (lower) request limit dies inside
    // `formData()`, so without this the organizer is told the server broke —
    // when in truth their image was simply too big, which is the one thing they
    // can act on. Siblings (`/api/upload/speaker-image`, `/api/admin/gallery/
    // upload`) answer 413 here too; the match is case-insensitive because the
    // runtime spells it "Body exceeded ... limit" as often as "body". Anything
    // else is a real failure and belongs in the outer catch, not dressed up as
    // a size problem.
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (error) {
      if (
        error instanceof Error &&
        /body|too large|payload/i.test(error.message)
      ) {
        return NextResponse.json(
          {
            error:
              'Image is too large to upload. Compress or resize it and try again — files approaching the 8 MB limit can be rejected before they reach us.',
          },
          { status: 413 },
        )
      }
      throw error
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (
      !(RICH_TEXT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return NextResponse.json(
        {
          error: `Unsupported image type. Use ${RICH_TEXT_IMAGE_MIME_TYPES.map(
            (t) => t.replace('image/', ''),
          ).join(', ')} — SVG is not allowed.`,
        },
        { status: 415 },
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Image is larger than 8 MB' },
        { status: 413 },
      )
    }

    const asset = await clientWrite.assets.upload(
      'image',
      Buffer.from(await file.arrayBuffer()),
      { filename: file.name, contentType: file.type },
    )

    if (!SANITY_IMAGE_REF_PATTERN.test(asset._id)) {
      return NextResponse.json(
        { error: 'That file was not stored as a usable image' },
        { status: 415 },
      )
    }

    return NextResponse.json({ assetId: asset._id })
  } catch (error) {
    console.error('Failed to upload rich text image:', error)
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 },
    )
  }
}
