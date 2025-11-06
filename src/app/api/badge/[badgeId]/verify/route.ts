import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { verifyBadgeSignature } from '@/lib/badge/crypto'
import {
  parseBadgeJson,
  extractProofFromAssertion,
  addVerificationStatus,
  BadgeNotFoundError,
  BadgeVerificationError,
} from '@/lib/badge/verification'

export const runtime = 'nodejs'

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
      throw new BadgeNotFoundError('Badge not found')
    }

    // Parse badge JSON
    const { assertion, error: parseError } = parseBadgeJson(badge.badge_json)

    if (parseError || !assertion) {
      throw new BadgeVerificationError(
        parseError || 'Failed to parse badge JSON',
      )
    }

    // Extract proof and verify signature
    const { assertionWithoutProof, proofValue } =
      extractProofFromAssertion(assertion)

    let signatureValid = false
    if (proofValue) {
      signatureValid = await verifyBadgeSignature(
        assertionWithoutProof,
        proofValue,
      )
    }

    // Add verification status to the assertion
    const verifiedAssertion = addVerificationStatus(assertion, signatureValid)

    return NextResponse.json(verifiedAssertion, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error verifying badge:', error)

    if (error instanceof BadgeNotFoundError) {
      return NextResponse.json(
        {
          valid: false,
          error: error.message,
        },
        { status: 404 },
      )
    }

    if (error instanceof BadgeVerificationError) {
      return NextResponse.json(
        {
          valid: false,
          error: error.message,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
      },
      { status: 500 },
    )
  }
}
