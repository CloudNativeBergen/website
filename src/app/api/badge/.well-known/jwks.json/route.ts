import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getIssuerUrl } from '@/lib/badge/crypto'

export const runtime = 'nodejs'

/**
 * JWK Set endpoint for badge verification
 * Returns the public key used to verify badge signatures
 * This endpoint is referenced in the verificationMethod field of badge proofs
 */
export async function GET() {
  try {
    const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY

    if (!publicKeyHex) {
      return NextResponse.json(
        { error: 'Public key not configured' },
        { status: 500 },
      )
    }

    const { conference } = await getConferenceForCurrentDomain()
    const issuerUrl = getIssuerUrl(conference.domains)
    const keyId = `${issuerUrl}#key-${publicKeyHex.substring(0, 8)}`

    return NextResponse.json(
      {
        keys: [
          {
            kty: 'OKP',
            crv: 'Ed25519',
            x: Buffer.from(publicKeyHex, 'hex').toString('base64url'),
            kid: keyId,
            use: 'sig',
            alg: 'EdDSA',
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=86400', // 24 hours
        },
      },
    )
  } catch (error) {
    console.error('Error generating JWKS:', error)
    return NextResponse.json(
      { error: 'Failed to generate key set' },
      { status: 500 },
    )
  }
}
