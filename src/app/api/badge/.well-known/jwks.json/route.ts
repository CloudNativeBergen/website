import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { normalizeProtocolForDomain } from '@/lib/openbadges'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

    if (!publicKey) {
      return NextResponse.json(
        { error: 'RSA public key not configured' },
        { status: 500 },
      )
    }

    const { domain } = await getConferenceForCurrentDomain()
    const issuerUrl = normalizeProtocolForDomain(domain)

    const publicKeyObj = createPublicKey(publicKey)
    const jwk = publicKeyObj.export({ format: 'jwk' })

    return NextResponse.json(
      {
        keys: [
          {
            ...jwk,
            kid: `${issuerUrl}/api/badge/issuer#key-1`,
            use: 'sig',
            alg: 'RS256',
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=86400',
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
