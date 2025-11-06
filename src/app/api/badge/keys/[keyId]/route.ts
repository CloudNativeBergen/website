import { NextResponse } from 'next/server'

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
      return NextResponse.json(
        { error: 'Public key not configured' },
        { status: 500 },
      )
    }

    // Extract key identifier (e.g., "key-6c4cf79d" from the keyId parameter)
    const expectedKeyPrefix = publicKeyHex.substring(0, 8)

    // Validate that the requested key matches our public key
    if (!keyId.startsWith('key-') || !keyId.includes(expectedKeyPrefix)) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    const issuerUrl =
      process.env.BADGE_ISSUER_URL ||
      `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    const fullKeyId = `${issuerUrl}/api/badge/keys/${keyId}`

    // Return public key in Multikey format (W3C standard)
    // https://www.w3.org/TR/vc-data-integrity/#multikey
    const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
    const multibasePrefix = 'z' // base58btc encoding indicator
    const ed25519Prefix = Buffer.from([0xed, 0x01]) // Ed25519 public key multicodec prefix

    // Combine prefix and public key, then encode to base58btc
    const multikey =
      multibasePrefix +
      Buffer.concat([ed25519Prefix, publicKeyBytes]).toString('base64url')

    return NextResponse.json(
      {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://w3id.org/security/multikey/v1',
        ],
        id: fullKeyId,
        type: 'Multikey',
        controller: issuerUrl,
        publicKeyMultibase: multikey,
      },
      {
        headers: {
          'Content-Type': 'application/ld+json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=86400, immutable', // 24 hours
        },
      },
    )
  } catch (error) {
    console.error('Error fetching public key:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve public key' },
      { status: 500 },
    )
  }
}
