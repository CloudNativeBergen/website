import { seedToMultikey } from '@/lib/openbadges'
import type { MultikeyDocument } from '@/lib/openbadges'

/**
 * Ed25519 embedded-proof verification method (eddsa-rdfc-2022)
 *
 * The 1EdTech digital-credentials-public-validator (inspect-vc
 * EmbeddedProofProbe) dereferences `proof.verificationMethod` and expects the
 * response to BE a verification-method document — it reads `controller` and
 * `publicKeyMultibase` off the TOP LEVEL of the returned JSON:
 *
 *   controller = keyStructure.get().asJsonObject().getString("controller");
 *   ...
 *   publicKeyMultibase = keyStructure.get().asJsonObject().getString("publicKeyMultibase");
 *
 * (jakarta JSON-P `getString(name)` is `getJsonString(name).getString()`, which
 * NPEs when the member is absent — the reported
 * "Cannot invoke JsonString.getString() because getJsonString(String) is null".)
 *
 * A fragment URL such as `${issuer.id}#key-ed25519` cannot satisfy this: the
 * HTTP loader strips the fragment and GETs the issuer Profile, whose root has
 * no top-level `controller` — the very first `getString("controller")` NPEs.
 *
 * So the proof must point at a dereferenceable endpoint that returns the bare
 * Multikey document (this is the same lesson the JWT/ExternalProofProbe path
 * already learned — see `verificationMethod: .../api/badge/keys/key-1`).
 *
 * @see https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/EmbeddedProofProbe.java
 */
export const ED25519_KEY_ID = 'key-ed25519'

/** Strip a trailing slash so URLs join cleanly. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Dereferenceable verification-method URL for embedded Data Integrity Proofs.
 * This is what new credentials pin in `proof.verificationMethod`; GETting it
 * returns the bare Multikey document below.
 *
 * @example "https://cloudnativedays.no/api/badge/keys/key-ed25519"
 */
export function ed25519VerificationMethodUrl(baseUrl: string): string {
  return `${stripTrailingSlash(baseUrl)}/api/badge/keys/${ED25519_KEY_ID}`
}

/**
 * Legacy embedded verification method: an issuer-profile fragment. Credentials
 * baked before the dereferenceable endpoint existed pinned this value, and the
 * bytes are frozen inside already-downloaded SVGs (the download route serves a
 * stored asset and never re-proofs). Kept only for back-compat recognition.
 *
 * @example "https://cloudnativedays.no/api/badge/issuer#key-ed25519"
 */
export function legacyEd25519VerificationMethod(issuerId: string): string {
  return `${issuerId}#${ED25519_KEY_ID}`
}

/** Recover the tenant base URL from an issuer profile id. */
export function baseUrlFromIssuerId(issuerId: string): string {
  return issuerId.replace(/\/api\/badge\/issuer$/, '')
}

/**
 * Every `proof.verificationMethod` value we recognise as OUR issuer's embedded
 * Ed25519 method: the current dereferenceable URL plus the legacy fragment.
 * Used by the verify paths so freshly minted and previously baked badges both
 * verify, while foreign / did:key methods still do not.
 */
export function acceptedEd25519VerificationMethods(issuerId: string): string[] {
  return [
    ed25519VerificationMethodUrl(baseUrlFromIssuerId(issuerId)),
    legacyEd25519VerificationMethod(issuerId),
  ]
}

/**
 * Resolve the issuer's Ed25519 public key as a multibase Multikey ("z6Mk…").
 *
 * Prefers the published public key (`BADGE_ISSUER_ED25519_PUBLIC_KEY`, which IS
 * the multibase) so verify-only deployments that hold no secret still publish a
 * key; falls back to deriving it from the secret seed. Returns undefined when
 * no usable Ed25519 material is configured.
 */
export async function resolveEd25519PublicKeyMultibase(): Promise<
  string | undefined
> {
  const ed25519PublicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
  const ed25519Seed = process.env.BADGE_ISSUER_ED25519_SEED

  if (ed25519PublicKey && ed25519PublicKey.startsWith('z')) {
    // The published public key is already a multibase Ed25519 Multikey.
    return ed25519PublicKey
  }

  if (ed25519Seed) {
    try {
      return (await seedToMultikey(ed25519Seed)).publicKeyMultibase
    } catch (error) {
      console.error(
        'Invalid BADGE_ISSUER_ED25519_SEED; cannot derive Ed25519 public key:',
        error,
      )
      return undefined
    }
  }

  if (ed25519PublicKey) {
    console.error(
      'BADGE_ISSUER_ED25519_PUBLIC_KEY is not a multibase Ed25519 key (expected "z" prefix)',
    )
  }

  return undefined
}

/**
 * Build the bare Multikey verification-method document served at
 * `/api/badge/keys/key-ed25519`. Its top-level `controller` and
 * `publicKeyMultibase` are exactly what the 1EdTech EmbeddedProofProbe reads.
 */
export function buildEd25519MultikeyDocument(
  baseUrl: string,
  publicKeyMultibase: string,
): MultikeyDocument {
  const base = stripTrailingSlash(baseUrl)
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
    ],
    id: ed25519VerificationMethodUrl(base),
    type: 'Multikey',
    controller: `${base}/api/badge/issuer`,
    publicKeyMultibase,
  }
}
