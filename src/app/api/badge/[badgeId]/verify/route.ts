import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  verifyCredential,
  validateCredential,
  generateVerificationResponse,
  generateErrorResponse,
} from '@/lib/openbadges'
import type { BadgeAssertion } from '@/lib/badge/types'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ badgeId: string }> },
) {
  try {
    const { badgeId } = await segmentData.params

    if (!badgeId) {
      return NextResponse.json(
        generateErrorResponse('Badge ID is required', 400),
        { status: 400 },
      )
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    // Parse badge JSON
    let assertion: BadgeAssertion
    try {
      assertion = JSON.parse(badge.badge_json) as BadgeAssertion
    } catch {
      return NextResponse.json({ error: 'Invalid badge JSON' }, { status: 500 })
    }

    // Validate structure first
    const validation = validateCredential(
      assertion as Parameters<typeof validateCredential>[0],
    )

    // Verify signature using OpenBadges library
    const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY
    if (!publicKeyHex) {
      return NextResponse.json(
        generateErrorResponse('Public key not configured', 500),
        { status: 500 },
      )
    }

    let signatureValid = false
    try {
      signatureValid = await verifyCredential(
        assertion as Parameters<typeof verifyCredential>[0],
        publicKeyHex,
      )
    } catch (error) {
      console.error('Verification error:', error)
      signatureValid = false
    }

    const isValid = validation.valid && signatureValid
    const response = generateVerificationResponse(
      isValid,
      assertion as Parameters<typeof verifyCredential>[0],
      validation.errors,
    )

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error verifying badge:', error)

    const message =
      error instanceof Error ? error.message : 'Failed to verify badge'

    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}
