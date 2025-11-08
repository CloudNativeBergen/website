/**
 * Issuer Profile Endpoint (OpenBadges 3.0)
 *
 * Returns the issuer profile with verification methods (public keys)
 * as required by the OpenBadges 3.0 specification.
 *
 * Uses RSA keys (RS256) and exposes JWK at #key-1 fragment for JWT verification.
 *
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/impl/
 */

import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { generateErrorResponse } from '@/lib/openbadges'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const rsaPublicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

    if (!rsaPublicKey) {
      return NextResponse.json(
        generateErrorResponse('RSA public key not configured', 500),
        { status: 500 },
      )
    }

    // Get conference from domain
    const { conference, domain: domainName } =
      await getConferenceForCurrentDomain()

    const url = new URL(request.url)
    const fragment = url.hash

    const publicKeyObj = createPublicKey(rsaPublicKey)
    const jwk = publicKeyObj.export({ format: 'jwk' })

    // If fragment is #key-1, return JWK directly
    if (fragment === '#key-1') {
      return NextResponse.json(jwk, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, immutable',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
        },
      })
    }

    // Return issuer profile

    const issuerProfile = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      ],
      id: domainName,
      type: 'Profile',
      name: conference.organizer,
      url: domainName,
      email:
        conference.contact_email ||
        (conference.domains?.[0]
          ? `contact@${conference.domains[0]}`
          : 'contact@cloudnativebergen.dev'),
      description: conference.description || conference.tagline || '',
      image: {
        id: `${domainName}/og/base.png`,
        type: 'Image',
      },
      publicKey: [
        {
          id: `${domainName}/api/badge/issuer#key-1`,
          type: 'JsonWebKey',
          publicKeyJwk: jwk,
        },
      ],
    }

    return NextResponse.json(issuerProfile, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Cache-Control': 'public, max-age=3600, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      },
    })
  } catch (error) {
    console.error('Error generating issuer profile:', error)
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate issuer profile'
    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  })
}
