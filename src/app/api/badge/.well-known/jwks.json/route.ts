/**
 * GET /api/badge/.well-known/jwks.json
 *
 * Returns a JSON Web Key Set (JWKS) containing the public keys used for
 * OpenBadges 3.0 credential verification.
 *
 * This endpoint follows RFC 7517 (JSON Web Key) specification and is the
 * recommended approach for publishing verification keys per OpenBadges 3.0
 * implementation guide section 3.1.12.
 *
 * IMPORTANT: Based on official OpenBadges 3.0 examples (credential-jwt-header.json),
 * the inline JWK contains ONLY kty, n, and e fields (no alg or use).
 * However, JWKS endpoints typically include kid for key identification.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#key-provenance
 * @see https://datatracker.ietf.org/doc/html/rfc7517
 */

import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export async function GET(): Promise<NextResponse> {
  try {
    // Load RSA public key from environment
    const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

    if (!publicKey) {
      return NextResponse.json(
        {
          error: 'Public key not configured',
          message:
            'BADGE_ISSUER_RSA_PUBLIC_KEY environment variable is not set.',
          documentation:
            'https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#key-generation',
        },
        { status: 500 },
      )
    }

    // Get conference data for domain context
    const { domain } = await getConferenceForCurrentDomain()
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`

    // Convert PEM public key to JWK format
    const publicKeyObj = createPublicKey(publicKey)
    const jwk = publicKeyObj.export({ format: 'jwk' })

    // Build JWKS per RFC 7517
    // Based on official OpenBadges 3.0 examples, the inline JWK includes ONLY:
    // - kty (key type)
    // - n (RSA modulus)
    // - e (RSA exponent)
    //
    // For JWKS endpoints, we add:
    // - kid (key ID pointing to individual key endpoint)
    //
    // Note: We removed "alg" and "use" fields to match the official examples
    const jwks = {
      keys: [
        {
          ...jwk,
          kid: `${baseUrl}/api/badge/keys/key-1`,
        },
      ],
    }

    return NextResponse.json(jwks, {
      headers: {
        'Content-Type': 'application/json',
        // Enable CORS for external validators
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Cache for 24 hours
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving JWKS:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to generate JWKS from public key',
        details: error instanceof Error ? error.message : String(error),
        documentation:
          'https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#troubleshooting',
      },
      { status: 500 },
    )
  }
}

/**
 * OPTIONS /api/badge/.well-known/jwks.json
 *
 * Handle CORS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
