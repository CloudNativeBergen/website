export { createCredential } from './credential'
export {
  signCredential,
  verifyCredential,
  signCredentialJWT,
  verifyCredentialJWT,
} from './crypto'

export { validateCredential, assertValidCredential } from './validator'

export { bakeBadge, extractBadge, isBakedSvg } from './baking'

export {
  validatePublicKey,
  generateKeyId,
  validateKeyId,
  publicKeyToMultibase,
  publicKeyToDidKey,
  generateDidKeyMultikeyDocument,
  generateMultikeyDocument,
  didKeyToPublicKeyHex,
} from './keys'

export {
  hexToBytes,
  bytesToHex,
  encodeBase58,
  decodeBase58,
  encodeMultibase,
  decodeMultibase,
  stringToBytes,
} from './encoding'

export {
  generateVerificationResponse,
  generateAchievementResponse,
  generateErrorResponse,
} from './outputs'

export {
  OpenBadgesError,
  SigningError,
  VerificationError,
  ValidationError,
  BakingError,
  ExtractionError,
  KeyFormatError,
  EncodingError,
  ConfigurationError,
  ERROR_CODES,
} from './errors'

export type {
  Credential,
  SignedCredential,
  Achievement,
  IssuerProfile,
  SubjectProfile,
  AchievementConfig,
  CredentialConfig,
  SigningConfig,
  ValidationResult,
  DataIntegrityProof,
  MultikeyDocument,
} from './types'

export { OB_CONTEXT, isJWTFormat, normalizeProtocolForDomain } from './types'
