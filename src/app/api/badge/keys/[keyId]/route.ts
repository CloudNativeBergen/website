import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { generateMultikeyDocument, validateKeyId } from '@/lib/openbadges'
import { normalizeProtocolForDomain } from '@/lib/badge/protocol'

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

    // Validate that the requested key matches our public key (throws on error)
    validateKeyId(keyId, publicKeyHex)

    // Get the domain from the current request and normalize protocol
    const { domain: domainName } = await getConferenceForCurrentDomain()
    const baseDomain = normalizeProtocolForDomain(domainName)
    const issuerUrl = `${baseDomain}/api/badge/issuer`

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

    const message =
      error instanceof Error ? error.message : 'Failed to retrieve public key'
    const is404 =
      message.includes('not found') || message.includes('does not match')

    return NextResponse.json({ error: message }, { status: is404 ? 404 : 500 })
  }
}
