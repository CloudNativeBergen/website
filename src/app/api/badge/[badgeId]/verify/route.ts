import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { verifyBadgeSignature } from '@/lib/badge/crypto'

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
      return NextResponse.json(
        {
          valid: false,
          error: 'Badge not found',
        },
        { status: 404 },
      )
    }

    const badgeAssertion = JSON.parse(badge.badge_json)

    let signatureValid = false
    if (badgeAssertion.proof && badgeAssertion.proof.proofValue) {
      const { proof, ...assertionWithoutProof } = badgeAssertion

      signatureValid = await verifyBadgeSignature(
        assertionWithoutProof,
        proof.proofValue,
      )
    }

    return NextResponse.json(
      {
        ...badgeAssertion,
        verified: signatureValid,
        verificationStatus: {
          valid: true,
          signatureValid,
          verifiedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          'Content-Type': 'application/ld+json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=3600',
        },
      },
    )
  } catch (error) {
    console.error('Error verifying badge:', error)
    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
      },
      { status: 500 },
    )
  }
}
