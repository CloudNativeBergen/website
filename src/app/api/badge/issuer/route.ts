/**
 * Issuer Profile Endpoint (OpenBadges 3.0)
 *
 * Returns the issuer profile with verification methods (public keys)
 * as required by the OpenBadges 3.0 specification.
 *
 * Exposes two keys:
 * - RSA JWK (publicKey, #key-1 fragment) for RS256 JWT verification
 * - Ed25519 Multikey (verificationMethod/assertionMethod) for embedded Data
 *   Integrity Proof verification. Two ids point at the same key: the
 *   dereferenceable /api/badge/keys/key-ed25519 URL that new credentials pin,
 *   and the legacy #key-ed25519 fragment that older baked SVGs pin. The bare
 *   Multikey document itself is served by /api/badge/keys/key-ed25519 (the
 *   1EdTech EmbeddedProofProbe dereferences proof.verificationMethod and reads
 *   the key off the response root, so it never consults this profile array).
 *
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/impl/
 */

import { NextResponse } from 'next/server'
import { createPublicKey } from 'crypto'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveConferenceContact } from '@/lib/email/from'
import { generateErrorResponse } from '@/lib/openbadges'
import {
  ed25519VerificationMethodUrl,
  legacyEd25519VerificationMethod,
  resolveEd25519PublicKeyMultibase,
} from '@/lib/badge/verification-method'

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
    // profile still serves the RSA JWT key when no Ed25519 key is configured).
    //
    // External verifiers (Credly, verifybadge.org) dereference this profile to
    // resolve the proof key, so verify-only / preview deployments that hold
    // only the PUBLIC key must still publish it.
    //
    // TWO ids are listed for the SAME key:
    // - the dereferenceable keys-endpoint URL (`/api/badge/keys/key-ed25519`),
    //   which new credentials pin in proof.verificationMethod, and
    // - the legacy issuer-profile fragment (`#key-ed25519`), which older baked
    //   SVGs pinned. Our own verify paths look the method up by id in this
    //   array, so keeping both lets previously downloaded badges still resolve.
    const issuerId = `${baseUrl}/api/badge/issuer`
    const publicKeyMultibase = await resolveEd25519PublicKeyMultibase()

    const ed25519KeyDocUrl = ed25519VerificationMethodUrl(baseUrl)
    const ed25519LegacyId = legacyEd25519VerificationMethod(issuerId)
    const ed25519VerificationMethods = publicKeyMultibase
      ? [
          {
            id: ed25519KeyDocUrl,
            type: 'Multikey' as const,
            controller: issuerId,
            publicKeyMultibase,
          },
          {
            id: ed25519LegacyId,
            type: 'Multikey' as const,
            controller: issuerId,
            publicKeyMultibase,
          },
        ]
      : undefined

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
      email: resolveConferenceContact(conference),
      description: conference.description || conference.tagline || '',
      image: {
        // Tenant's own mark (see `resolveBadgeConfiguration`), not the static
        // Cloud Native Day Bergen OpenGraph plate this used to serve.
        id: `${baseUrl}/pwa/icon/512`,
        type: 'Image',
      },
      publicKey: [
        {
          id: `${issuerId}#key-1`,
          type: 'JsonWebKey',
          publicKeyJwk: jwk,
        },
      ],
      ...(ed25519VerificationMethods && {
        verificationMethod: ed25519VerificationMethods,
        assertionMethod: ed25519VerificationMethods.map((vm) => vm.id),
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
