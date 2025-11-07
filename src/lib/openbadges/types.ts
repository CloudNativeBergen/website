/**
 * OpenBadges 3.0 Type Definitions
 *
 * Type definitions for OpenBadges 3.0 compliant credentials and related structures.
 * Based on: https://www.imsglobal.org/spec/ob/v3p0/
 */

/**
 * OpenBadges 3.0 context URLs
 */
export const OB_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
] as const

/**
 * Image object (OB 3.0)
 */
export interface ImageObject {
  id: string
  type: 'Image'
  caption?: string
}

/**
 * Criteria object describing how the achievement was earned
 */
export interface Criteria {
  id?: string
  narrative: string
}

/**
 * Evidence supporting the achievement
 */
export interface Evidence {
  id: string
  type: string[]
  name: string
  description?: string
}

/**
 * Issuer Profile (OB 3.0)
 */
export interface IssuerProfile {
  id: string
  type: string[]
  name: string
  url: string
  email?: string
  description?: string
  image?: ImageObject
}

/**
 * Achievement (badge class definition)
 */
export interface Achievement {
  '@context': readonly string[]
  id: string
  type: string[]
  name: string
  description: string
  criteria: Criteria
  image: ImageObject
  issuer: IssuerProfile
  evidence?: Evidence[]
}

/**
 * Achievement Subject (recipient)
 */
export interface AchievementSubject {
  id: string
  type: string[]
  achievement: Achievement
}

/**
 * Data Integrity Proof (eddsa-rdfc-2022)
 */
export interface DataIntegrityProof {
  type: 'DataIntegrityProof'
  created: string
  verificationMethod: string
  cryptosuite: 'eddsa-rdfc-2022'
  proofPurpose: 'assertionMethod'
  proofValue: string
}

/**
 * OpenBadges 3.0 Credential (unsigned)
 */
export interface Credential {
  '@context': readonly string[]
  id: string
  type: string[]
  name: string
  credentialSubject: AchievementSubject
  issuer: IssuerProfile
  validFrom: string
  validUntil?: string
}

/**
 * OpenBadges 3.0 Credential (signed with proof)
 */
export interface SignedCredential extends Credential {
  proof: DataIntegrityProof[]
}

/**
 * Configuration for creating an achievement
 */
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
  evidence?: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }>
}

/**
 * Configuration for credential subject
 */
export interface SubjectProfile {
  id: string
  type: string[]
}

/**
 * Configuration for issuer profile
 */
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

/**
 * Configuration for creating a credential
 */
export interface CredentialConfig {
  credentialId: string
  name?: string
  issuer: IssuerProfileConfig
  subject: SubjectProfile
  achievement: AchievementConfig
  validFrom: string
  validUntil?: string
}

/**
 * Configuration for signing a credential
 */
export interface SigningConfig {
  privateKey: string
  publicKey: string
  verificationMethod: string
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors?: Array<{
    field: string
    message: string
    value?: unknown
  }>
}

/**
 * W3C Multikey document structure
 */
export interface MultikeyDocument {
  '@context': string[]
  id: string
  type: 'Multikey'
  controller: string
  publicKeyMultibase: string
}
