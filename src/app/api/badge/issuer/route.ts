/**
 * Issuer Profile Endpoint (OpenBadges 3.0)
 *
 * Returns the issuer profile with verification methods (public keys)
 * as required by the OpenBadges 3.0 specification.
 *
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/impl/
 */

import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  generateMultikeyDocument,
  generateKeyId,
  generateErrorResponse,
} from '@/lib/openbadges'
import { normalizeProtocolForDomain } from '@/lib/badge/protocol'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY

    if (!publicKeyHex) {
      return NextResponse.json(
        generateErrorResponse('Public key not configured', 500),
        { status: 500 },
      )
    }

    // Get conference from domain
    const { conference, domain: domainName } =
      await getConferenceForCurrentDomain()

    // Normalize protocol for domain (http for localhost, https otherwise)
    const domain = normalizeProtocolForDomain(domainName)

    // Issuer profile URL - this should be the controller
    const issuerProfileUrl = `${domain}/api/badge/issuer`

    // Generate key ID from public key
    const keyId = generateKeyId(publicKeyHex)

    // Generate Multikey document with issuer profile as controller
    const multikeyDoc = generateMultikeyDocument(
      publicKeyHex,
      keyId,
      issuerProfileUrl,
    )

    // OpenBadges 3.0 Issuer Profile with verificationMethod
    const issuerProfile = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      ],
      id: issuerProfileUrl,
      type: 'Profile',
      name: conference.title,
      url: domain,
      email: 'contact@cloudnativebergen.dev',
      description: conference.description || conference.tagline || '',
      image: {
        id: `${domain}/og/base.png`,
        type: 'Image',
      },
      verificationMethod: [
        {
          id: multikeyDoc.id,
          type: multikeyDoc.type,
          controller: multikeyDoc.controller,
          publicKeyMultibase: multikeyDoc.publicKeyMultibase,
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
