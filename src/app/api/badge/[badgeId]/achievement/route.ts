import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  generateAchievementResponse,
  generateErrorResponse,
  verifyCredentialJWT,
  isJWTFormat,
} from '@/lib/openbadges'

/**
 * GET /api/badge/[badgeId]/achievement
 * Returns the Achievement (badge class) from the credential
 */
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
      return NextResponse.json(generateErrorResponse('Badge not found', 404), {
        status: 404,
      })
    }

    let badgeAssertion
    if (isJWTFormat(badge.badgeJson)) {
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

      if (!publicKey) {
        return NextResponse.json(
          generateErrorResponse('RSA public key not configured', 500),
          { status: 500 },
        )
      }

      try {
        badgeAssertion = await verifyCredentialJWT(badge.badgeJson, publicKey)
      } catch {
        return NextResponse.json(generateErrorResponse('Invalid JWT', 500), {
          status: 500,
        })
      }
    } else {
      // Parse JSON (legacy Data Integrity Proof format)
      try {
        badgeAssertion = JSON.parse(badge.badgeJson)
      } catch {
        return NextResponse.json(
          generateErrorResponse('Invalid badge JSON', 500),
          { status: 500 },
        )
      }
    }

    const achievement = badgeAssertion.credentialSubject?.achievement

    if (!achievement) {
      return NextResponse.json(
        generateErrorResponse('Achievement not found in badge', 404),
        { status: 404 },
      )
    }

    return NextResponse.json(generateAchievementResponse(achievement), {
      status: 200,
      headers: {
        'Content-Type': 'application/ld+json',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error fetching badge achievement:', error)
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}
