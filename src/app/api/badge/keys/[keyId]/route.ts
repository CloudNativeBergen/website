/**
 * GET /api/badge/keys/[keyId]
 *
 * Returns a bare JWK (JSON Web Key) object for the specified key ID.
 * This endpoint is used by the OpenBadges 3.0 JWT `kid` (key ID) field
 * to dereference the public key used for signature verification.
 *
 * CRITICAL: This endpoint MUST return a bare JWK object, not an issuer profile.
 * The 1EdTech OB30Inspector validator expects the response to be a JWK with
 * `kty`, `n`, and `e` fields at the top level.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#external-proof-jwt-proof
 * @see https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/ExternalProofProbe.java#L63
 */

import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<NextResponse> {
  try {
    const { keyId } = await params

    // Validate key ID - only support 'key-1' for now
    if (keyId !== 'key-1') {
      return NextResponse.json(
        {
          error: 'Key not found',
          message: `Key ID &apos;${keyId}&apos; not found. Currently only &apos;key-1&apos; is supported.`,
          documentation:
            'https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#key-management',
        },
        { status: 404 },
      )
    }

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

    // Convert PEM public key to JWK format
    const publicKeyObj = createPublicKey(publicKey)
    const jwk = publicKeyObj.export({ format: 'jwk' })

    // CRITICAL: Return BARE JWK object only (no wrapper, no additional fields)
    // The Java validator expects: { "kty": "RSA", "e": "AQAB", "n": "..." }
    //
    // The validator code does:
    //   String kty = jwk.get("kty").asText();
    //
    // If we return anything other than a JWK at the top level, this will fail
    // with a NullPointerException.
    return NextResponse.json(jwk, {
      headers: {
        'Content-Type': 'application/json',
        // Enable CORS for external validators
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Cache public key for 24 hours (immutable since we don&apos;t rotate keys)
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving JWK:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to generate JWK from public key',
        details: error instanceof Error ? error.message : String(error),
        documentation:
          'https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#troubleshooting',
      },
      { status: 500 },
    )
  }
}

/**
 * OPTIONS /api/badge/keys/[keyId]
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
