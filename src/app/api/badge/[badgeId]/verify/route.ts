import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  verifyCredential,
  verifyCredentialJWT,
  validateCredential,
  generateVerificationResponse,
  generateErrorResponse,
  isJWTFormat,
  TrustAnchorError,
  type VerificationOutcome,
} from '@/lib/openbadges'
import { acceptedEd25519VerificationMethods } from '@/lib/badge/verification-method'

/**
 * "We could not evaluate this credential" — never a verdict, never cached.
 *
 * Used for BOTH a failed badge lookup (#848/#855) and a failed cryptographic
 * evaluation (#859). The shared shape is the point: an external verifier gets
 * one unambiguous signal — come back later — instead of a negative answer that
 * intermediaries would then serve for an hour after we fixed the cause.
 */
const UNAVAILABLE_MESSAGE =
  'Badge verification is temporarily unavailable; this is not a statement about the credential'

function verificationUnavailable() {
  return NextResponse.json(generateErrorResponse(UNAVAILABLE_MESSAGE, 503), {
    status: 503,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      // Never cache a non-answer as though it were one.
      'Cache-Control': 'no-store',
      'Retry-After': '30',
    },
  })
}

/**
 * GET /api/badge/[badgeId]/verify
 *
 * Verifies an OpenBadges 3.0 credential signature.
 *
 * Legacy badges (badgeJson holds a JWT) are verified with the RSA public
 * key; embedded-proof badges are verified with the published Ed25519 public
 * key (BADGE_ISSUER_ED25519_PUBLIC_KEY). Verification never needs the secret
 * seed. The proof's verificationMethod is pinned to OUR issuer's embedded VM
 * (the dereferenceable `${baseUrl}/api/badge/keys/key-ed25519` URL, or the
 * legacy `${issuer.id}#key-ed25519` fragment for previously baked badges), so
 * a badge presented with a foreign or did:key method is reported as
 * not-issued-by-us.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ badgeId: string }> },
) {
  try {
    const { badgeId } = await segmentData.params

    if (!badgeId) {
      return NextResponse.json(
        generateErrorResponse('Badge ID is required', 400),
        { status: 400 },
      )
    }

    const { badge, error, reason } = await getBadgeById(badgeId)

    // A FAILED read is not a verdict (#848). This endpoint answers external
    // verifiers — employers, other credential platforms — and a 404 is a
    // definitive, cacheable "this credential does not exist", i.e. exactly
    // what a forgery looks like. When the badge store is unreachable we do not
    // know, so say 503 and invite a retry rather than impugn a real badge.
    if (reason === 'unavailable') {
      console.error('Badge lookup unavailable during verification:', error)
      return verificationUnavailable()
    }

    if (error || !badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    if (isJWTFormat(badge.badgeJson)) {
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

      if (!publicKey) {
        console.error(
          'BADGE_ISSUER_RSA_PUBLIC_KEY is not configured; cannot evaluate legacy JWT badges',
        )
        return verificationUnavailable()
      }

      try {
        const credential = await verifyCredentialJWT(badge.badgeJson, publicKey)

        const validation = validateCredential(
          credential as Parameters<typeof validateCredential>[0],
        )

        const response = generateVerificationResponse(
          validation.valid,
          credential as Parameters<typeof verifyCredential>[0],
          validation.errors,
        )

        return NextResponse.json(response, {
          headers: {
            'Content-Type': 'application/ld+json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      } catch (verifyError) {
        // Our RSA key would not import: nothing about this credential was
        // evaluated, so we must not answer with a cached "not verified".
        if (verifyError instanceof TrustAnchorError) {
          console.error(
            'Legacy JWT badge could not be evaluated (trust anchor unusable):',
            verifyError,
          )
          return verificationUnavailable()
        }

        console.error('JWT verification failed:', verifyError)
        return NextResponse.json(
          {
            verified: false,
            errors: [
              verifyError instanceof Error
                ? verifyError.message
                : 'JWT signature verification failed',
            ],
          },
          {
            headers: {
              'Content-Type': 'application/ld+json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Cache-Control': 'public, max-age=3600',
            },
          },
        )
      }
    }

    // Embedded Data Integrity Proof format
    let assertion
    try {
      assertion = JSON.parse(badge.badgeJson)
    } catch {
      return NextResponse.json({ error: 'Invalid badge JSON' }, { status: 500 })
    }

    // Validate structure first
    const validation = validateCredential(
      assertion as Parameters<typeof validateCredential>[0],
    )

    // Verify the signature with OUR published Ed25519 public key. Verifying
    // never requires the secret seed.
    const publicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    if (!publicKey) {
      // A missing key is OUR deployment, not the badge. Answering with a
      // verdict here would report every genuine badge as unverified.
      console.error(
        'BADGE_ISSUER_ED25519_PUBLIC_KEY is not configured; cannot evaluate embedded-proof badges',
      )
      return verificationUnavailable()
    }

    let outcome: VerificationOutcome
    try {
      // Pin the verification method to OUR issuer's embedded VM. A badge
      // presented with a foreign / did:key VM must never earn a green check
      // from this endpoint, even if it is internally self-consistent. Both the
      // current dereferenceable keys URL and the legacy issuer-profile fragment
      // are accepted so previously baked SVGs still verify.
      const issuerId =
        typeof assertion.issuer === 'object'
          ? assertion.issuer?.id
          : assertion.issuer
      const proofVm = assertion.proof?.[0]?.verificationMethod

      if (!acceptedEd25519VerificationMethods(issuerId).includes(proofVm)) {
        outcome = {
          status: 'invalid',
          reason: 'untrusted-verification-method',
        }
      } else {
        outcome = await verifyCredential(
          assertion as Parameters<typeof verifyCredential>[0],
          publicKey,
        )
      }
    } catch (error) {
      // verifyCredential is total for credential-caused failures, so this is
      // the badge-shaped fallback (e.g. reading fields off a hostile
      // assertion). Credential bytes are presenter-controlled: verdict.
      console.error('Verification error:', error)
      outcome = { status: 'invalid', reason: 'malformed-credential' }
    }

    // #859. A `boolean` could not say "I could not evaluate this", so a
    // botched key rotation reported every genuine badge as forged — and the
    // `max-age=3600` below meant intermediaries kept serving that answer for
    // an hour after the fix. Answer 503/no-store instead.
    if (outcome.status === 'indeterminate') {
      console.error(
        'Badge signature could not be evaluated:',
        outcome.reason,
        outcome.detail,
      )
      return verificationUnavailable()
    }

    const isValid = validation.valid && outcome.status === 'verified'
    const response = generateVerificationResponse(
      isValid,
      assertion as Parameters<typeof verifyCredential>[0],
      validation.errors,
    )

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    // Log the detail server-side; return a generic message to the client so
    // internal error details are not exposed.
    console.error('Error verifying badge:', error)

    return NextResponse.json(
      generateErrorResponse('Failed to verify badge', 500),
      { status: 500 },
    )
  }
}
