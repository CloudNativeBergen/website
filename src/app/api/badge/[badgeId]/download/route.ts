import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById, getBadgeSVGUrl } from '@/lib/badge/sanity'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  badgeArtifactETag,
  badgeNotModifiedResponse,
} from '@/lib/badge/http'
import { renderBadgeSvgToPng, bakeCredentialIntoPng } from '@/lib/badge/png'

/**
 * GET /api/badge/[badgeId]/download
 *
 * Downloads the baked badge. Default is the OpenBadges 3.0 baked SVG
 * (`<openbadges:credential>` CDATA). `?format=png` returns a rasterized PNG with
 * the same credential baked into an `openbadgecredential` iTXt chunk — a second
 * container for displayers/tools that prefer PNG.
 *
 * Both formats are REBAKE-MUTABLE, so they carry a revalidating cache + an ETag
 * that changes when the badge is rebaked (see lib/badge/http.ts). This replaces
 * the previous `immutable, max-age=1yr` policy that stranded rebakes in cache.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ badgeId: string }> },
) {
  try {
    const { badgeId } = await segmentData.params

    if (!badgeId) {
      return NextResponse.json(
        { error: 'Badge ID is required' },
        { status: 400 },
      )
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const wantPng = request.nextUrl?.searchParams?.get('format') === 'png'

    const etag = badgeArtifactETag(badge, wantPng ? 'download-png' : 'download')
    const notModified = badgeNotModifiedResponse(request, etag)
    if (notModified) return notModified

    const svgUrl = getBadgeSVGUrl(badge)

    if (!svgUrl) {
      return NextResponse.json(
        { error: 'Badge SVG not available' },
        { status: 404 },
      )
    }

    const svgResponse = await fetch(svgUrl)
    if (!svgResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch badge SVG' },
        { status: 500 },
      )
    }

    const svgContent = await svgResponse.text()

    const speakerName =
      badge.speaker &&
      typeof badge.speaker === 'object' &&
      'name' in badge.speaker
        ? badge.speaker.name.replace(/\s+/g, '-').toLowerCase()
        : 'speaker'

    if (wantPng) {
      try {
        const png = renderBadgeSvgToPng(svgContent)
        const bakedPng = bakeCredentialIntoPng(png, badge.badgeJson)
        return new NextResponse(Buffer.from(bakedPng), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="badge-${speakerName}-${badgeId}.png"`,
            'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
            ETag: etag,
          },
        })
      } catch (pngError) {
        console.error('Error rendering badge PNG:', pngError)
        return NextResponse.json(
          { error: 'Failed to render badge PNG' },
          { status: 500 },
        )
      }
    }

    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="badge-${speakerName}-${badgeId}.svg"`,
        'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
        ETag: etag,
      },
    })
  } catch (error) {
    console.error('Error downloading badge:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
