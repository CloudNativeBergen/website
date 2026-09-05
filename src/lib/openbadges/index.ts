export { createCredential } from './credential'
export {
  signCredential,
  verifyCredential,
  signCredentialJWT,
  verifyCredentialJWT,
  seedToMultikey,
} from './crypto'
export type { VerificationOutcome } from './crypto'

export { validateCredential, assertValidCredential } from './validator'

export { bakeBadge, extractBadge, isBakedSvg } from './baking'

export {
  generateKeyId,
  publicKeyToMultibase,
  publicKeyToDidKey,
  generateDidKeyMultikeyDocument,
  generateMultikeyDocument,
  didKeyToPublicKeyHex,
} from './keys'

export {
  hexToBytes,
  bytesToHex,
  encodeMultibase,
  decodeMultibase,
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
  TrustAnchorError,
  ValidationError,
  BakingError,
  ExtractionError,
  KeyFormatError,
  EncodingError,
  ConfigurationError,
} from './errors'

export type {
  SignedCredential,
  IssuerProfile,
  SubjectProfile,
  AchievementConfig,
  CredentialConfig,
  SigningConfig,
  MultikeyDocument,
} from './types'

export { OB_CONTEXT, isJWTFormat } from './types'
