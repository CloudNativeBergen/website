export const OB_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
] as const

export function isJWTFormat(credential: string): boolean {
  return credential.startsWith('eyJ')
}

export function normalizeProtocolForDomain(domain: string): string {
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return domain
  }
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${domain}`
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
  evidence?: Evidence[]
}

export interface AchievementSubject {
  id: string
  type: string[]
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
  evidence?: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }>
}

export interface SubjectProfile {
  id: string
  type: string[]
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
  validFrom: string
  validUntil?: string
}

export interface SigningConfig {
  privateKey: string
  publicKey: string
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
