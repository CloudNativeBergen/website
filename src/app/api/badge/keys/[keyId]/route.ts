/**
 * GET /api/badge/keys/[keyId]
 *
 * Dereferenceable public-key endpoint for OpenBadges 3.0 proof verification.
 * Two keys are served, each as a BARE key document (never wrapped in an issuer
 * profile) so external validators can read the key material off the response
 * root:
 *
 * - `key-1`        → bare RSA JWK (`{kty, n, e}`) for the RS256 JWT `kid`.
 *   The 1EdTech ExternalProofProbe reads `jwk.get("kty")` off the top level.
 * - `key-ed25519`  → bare Multikey (`{id, type, controller, publicKeyMultibase}`)
 *   for the embedded eddsa-rdfc-2022 `proof.verificationMethod`. The 1EdTech
 *   EmbeddedProofProbe reads `controller`/`publicKeyMultibase` off the top
 *   level — pointing the proof at the issuer profile (no top-level controller)
 *   NPEs the validator, which is exactly the bug this endpoint fixes.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#external-proof-jwt-proof
 * @see https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/ExternalProofProbe.java#L63
 * @see https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/EmbeddedProofProbe.java
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createPublicKey } from 'crypto'
import { normalizeDomain } from '@/lib/conference/domains'
import {
  ED25519_KEY_ID,
  buildEd25519MultikeyDocument,
  resolveEd25519PublicKeyMultibase,
} from '@/lib/badge/verification-method'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
} as const

const DOCS_URL =
  'https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#key-management'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<NextResponse> {
  try {
    const { keyId } = await params

    if (keyId === 'key-1') {
      return serveRsaJwk()
    }

    if (keyId === ED25519_KEY_ID) {
      return await serveEd25519Multikey()
    }

    return NextResponse.json(
      {
        error: 'Key not found',
        message: `Key ID '${keyId}' not found. Supported keys: 'key-1', '${ED25519_KEY_ID}'.`,
        documentation: DOCS_URL,
      },
      { status: 404, headers: { ...CORS_HEADERS } },
    )
  } catch (error) {
    console.error('Error serving key document:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to generate key document',
        details: error instanceof Error ? error.message : String(error),
        documentation: DOCS_URL,
      },
      { status: 500, headers: { ...CORS_HEADERS } },
    )
  }
}

/**
 * Serve the RSA public key as a bare JWK for the RS256 JWT external proof.
 * CRITICAL: the validator does `String kty = jwk.get("kty").asText();`, so the
 * response MUST be a bare JWK object with no wrapper fields.
 */
function serveRsaJwk(): NextResponse {
  const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

  if (!publicKey) {
    return NextResponse.json(
      {
        error: 'Public key not configured',
        message: 'BADGE_ISSUER_RSA_PUBLIC_KEY environment variable is not set.',
        documentation: DOCS_URL,
      },
      { status: 500, headers: { ...CORS_HEADERS } },
    )
  }

  const jwk = createPublicKey(publicKey).export({ format: 'jwk' })

  return NextResponse.json(jwk, {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      // Cache public key for 24 hours (immutable since we don't rotate keys)
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}

/**
 * Serve the Ed25519 public key as a bare Multikey document for the embedded
 * Data Integrity Proof. This is the URL that `proof.verificationMethod` points
 * at; the EmbeddedProofProbe reads `controller`/`publicKeyMultibase` off the
 * response root.
 */
async function serveEd25519Multikey(): Promise<NextResponse> {
  const publicKeyMultibase = await resolveEd25519PublicKeyMultibase()

  if (!publicKeyMultibase) {
    return NextResponse.json(
      {
        error: 'Ed25519 public key not configured',
        message:
          'Set BADGE_ISSUER_ED25519_PUBLIC_KEY (multibase "z…") or ' +
          'BADGE_ISSUER_ED25519_SEED to publish the embedded-proof key.',
        documentation: DOCS_URL,
      },
      { status: 500, headers: { ...CORS_HEADERS } },
    )
  }

  // Derive the tenant base URL from the request host, matching the issuer
  // profile endpoint (getConferenceForCurrentDomain uses the same header) —
  // normalized with the house helper so the key document's id/controller
  // byte-match the ids minted into credentials (which derive from the stored,
  // normalized conference domains).
  const host = normalizeDomain((await headers()).get('host') || '')
  const baseUrl = `https://${host}`

  const keyDocument = buildEd25519MultikeyDocument(baseUrl, publicKeyMultibase)

  return NextResponse.json(keyDocument, {
    headers: {
      // A Multikey document is JSON-LD; serve ld+json so JSON-LD document
      // loaders (Titanium, used by the validator) accept it directly.
      'Content-Type': 'application/ld+json',
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
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
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  })
}
