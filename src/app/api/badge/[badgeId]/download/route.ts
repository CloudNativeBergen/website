import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById, getBadgeSVGUrl } from '@/lib/badge/sanity'

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
      typeof badge.speaker === 'object' && 'name' in badge.speaker
        ? badge.speaker.name.replace(/\s+/g, '-').toLowerCase()
        : 'speaker'

    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="badge-${speakerName}-${badgeId}.svg"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
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
