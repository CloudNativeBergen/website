import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  generateMultikeyDocument,
  validateKeyId,
  KeyNotFoundError,
  KeyConfigurationError,
  KeyValidationError,
} from '@/lib/badge/keys'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{
    keyId: string
  }>
}

/**
 * Public Key endpoint for badge verification
 * Returns the public key for a specific key ID in Multikey format
 * This endpoint is referenced in the verificationMethod field of badge proofs
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { keyId } = await context.params
    const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY

    if (!publicKeyHex) {
      throw new KeyConfigurationError('Public key not configured')
    }

    // Validate that the requested key matches our public key
    const validation = validateKeyId(keyId, publicKeyHex)
    if (!validation.valid) {
      throw new KeyNotFoundError(validation.error || 'Key not found')
    }

    // Get the domain from the current request
    const { domain } = await getConferenceForCurrentDomain()
    const issuerUrl = `https://${domain}`

    // Generate the Multikey document
    const multikeyDoc = generateMultikeyDocument(publicKeyHex, keyId, issuerUrl)

    return NextResponse.json(multikeyDoc, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=86400, immutable', // 24 hours
      },
    })
  } catch (error) {
    console.error('Error fetching public key:', error)

    if (error instanceof KeyNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    if (error instanceof KeyConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (error instanceof KeyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Failed to retrieve public key' },
      { status: 500 },
    )
  }
}
