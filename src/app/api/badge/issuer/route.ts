/**
 * Issuer Profile Endpoint (OpenBadges 3.0)
 *
 * Returns the issuer profile with verification methods (public keys)
 * as required by the OpenBadges 3.0 specification.
 *
 * Exposes two keys:
 * - RSA JWK (publicKey, #key-1 fragment) for RS256 JWT verification
 * - Ed25519 Multikey (verificationMethod/assertionMethod, #key-ed25519
 *   fragment) for embedded Data Integrity Proof verification — verifiers
 *   strip the fragment from proof.verificationMethod and dereference this
 *   profile, whose controller must equal the credential's issuer.id
 *
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/impl/
 */

import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { generateErrorResponse, seedToMultikey } from '@/lib/openbadges'

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

    // Ensure domain includes protocol (domainName is just hostname from headers)
    const baseUrl = `https://${domainName}`

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

    // Ed25519 Multikey for embedded Data Integrity Proofs (optional; the
    // profile still serves the RSA JWT key when the seed is not configured)
    const issuerId = `${baseUrl}/api/badge/issuer`
    const ed25519Seed = process.env.BADGE_ISSUER_ED25519_SEED
    let ed25519VerificationMethod:
      | {
          id: string
          type: 'Multikey'
          controller: string
          publicKeyMultibase: string
        }
      | undefined
    if (ed25519Seed) {
      try {
        const { publicKeyMultibase } = await seedToMultikey(ed25519Seed)
        ed25519VerificationMethod = {
          id: `${issuerId}#key-ed25519`,
          type: 'Multikey',
          controller: issuerId,
          publicKeyMultibase,
        }
      } catch (seedError) {
        console.error(
          'Invalid BADGE_ISSUER_ED25519_SEED; omitting Ed25519 verification method:',
          seedError,
        )
      }
    }

    // Return issuer profile
    // The profile doubles as the controller document for embedded proofs:
    // the DID context is listed first so JSON-LD verifiers can read the
    // verificationMethod/assertionMethod relationships directly.
    const issuerProfile = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        'https://w3id.org/security/multikey/v1',
      ],
      id: issuerId,
      type: ['Profile'],
      name: conference.organizer,
      url: baseUrl,
      email:
        conference.contactEmail ||
        (conference.domains?.[0]
          ? `contact@${conference.domains[0]}`
          : 'contact@cloudnativedays.no'),
      description: conference.description || conference.tagline || '',
      image: {
        id: `${baseUrl}/og/base.png`,
        type: 'Image',
      },
      publicKey: [
        {
          id: `${issuerId}#key-1`,
          type: 'JsonWebKey',
          publicKeyJwk: jwk,
        },
      ],
      ...(ed25519VerificationMethod && {
        verificationMethod: [ed25519VerificationMethod],
        assertionMethod: [ed25519VerificationMethod.id],
      }),
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
    // Log detail server-side; return a generic message to the client.
    console.error('Error generating issuer profile:', error)
    return NextResponse.json(
      generateErrorResponse('Failed to generate issuer profile', 500),
      { status: 500 },
    )
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
