export const OB_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
] as const

export function isJWTFormat(credential: string): boolean {
  return credential.startsWith('eyJ')
}

export interface ImageObject {
  id: string
  type: 'Image'
  caption?: string
}

export interface Criteria {
  id?: string
  narrative: string
}

export interface Evidence {
  id: string
  type: string[]
  name: string
  description?: string
}

export interface IssuerProfile {
  id: string
  type: string[]
  name: string
  url: string
  email?: string
  description?: string
  image?: ImageObject
}

export interface Achievement {
  id: string
  type: string[]
  name: string
  description: string
  criteria: Criteria
  image: ImageObject
  creator: IssuerProfile // Per OpenBadges 3.0 spec: Achievement uses "creator" property
}

/**
 * OB 3.0 IdentityObject — a recipient identifier used by displayers (Credly,
 * Badgr, …) to match a badge to a signed-in user's verified identity. The
 * `type` member is the plain string "IdentityObject" (NOT an array) per the
 * normative schema. `identityHash` carries the plaintext value when
 * `hashed: false`; a salted hash (sha256$…) is the privacy-preserving variant.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/#identityobject
 */
export interface IdentityObject {
  type: 'IdentityObject'
  hashed: boolean
  identityHash: string
  identityType: 'emailAddress' | string
  salt?: string
}

export interface AchievementSubject {
  id: string
  type: string[]
  /**
   * Recipient identifiers. Emitted as an array with a single emailAddress
   * IdentityObject so ownership matching works on import; either `id` or at
   * least one `identifier` is required by OB 3.0.
   */
  identifier?: IdentityObject[]
  achievement: Achievement
}

export interface DataIntegrityProof {
  type: 'DataIntegrityProof'
  created: string
  verificationMethod: string
  cryptosuite: 'eddsa-rdfc-2022'
  proofPurpose: 'assertionMethod'
  proofValue: string
}

export interface Credential {
  '@context': readonly string[]
  id: string
  type: string[]
  name: string
  credentialSubject: AchievementSubject
  issuer: IssuerProfile
  validFrom: string
  validUntil?: string
  // Per VC 2.0 / OB 3.0: evidence belongs at the credential top level,
  // NOT nested under achievement (the OB context rejects that placement)
  evidence?: Evidence[]
}

export interface SignedCredential extends Credential {
  proof: DataIntegrityProof[]
}

export interface AchievementConfig {
  id: string
  name: string
  description: string
  criteria: {
    narrative: string
    id?: string
  }
  image: {
    id: string
    type: 'Image'
    caption?: string
  }
}

export interface SubjectProfile {
  id: string
  type: string[]
  identifier?: IdentityObject[]
}

export interface IssuerProfileConfig {
  id: string
  name: string
  url: string
  email?: string
  description?: string
  image?: {
    id: string
    type: 'Image'
  }
  domains?: string[]
}

export interface CredentialConfig {
  credentialId: string
  name?: string
  issuer: IssuerProfileConfig
  subject: SubjectProfile
  achievement: AchievementConfig
  evidence?: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }>
  validFrom: string
  validUntil?: string
}

export interface SigningConfig {
  privateKey: string
  publicKey: string
  verificationMethod: string
}

/**
 * Signing configuration for embedded Data Integrity Proofs.
 * privateKey is the 32-byte Ed25519 seed as 64 hex characters; the public
 * key is derived from the seed (and checked against publicKey if provided).
 */
export interface EmbeddedProofSigningConfig {
  privateKey: string
  publicKey?: string
  verificationMethod: string
}

export interface ValidationResult {
  valid: boolean
  errors?: Array<{
    field: string
    message: string
    value?: unknown
  }>
}

export interface MultikeyDocument {
  '@context': string[]
  id: string
  type: 'Multikey'
  controller: string
  publicKeyMultibase: string
}
