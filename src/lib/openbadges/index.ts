/**
 * OpenBadges 3.0 Library
 *
 * A modern, type-safe implementation of the OpenBadges 3.0 specification.
 * Provides credential creation, signing, verification, validation, and baking.
 *
 * @version 1.0.0
 * @license MIT
 */

// Core credential operations
export { createCredential } from './credential'
export {
  signCredential,
  verifyCredential,
  signCredentialJWT,
  verifyCredentialJWT,
} from './crypto'

// Validation
export { validateCredential, assertValidCredential } from './validator'

// Badge baking
export { bakeBadge, extractBadge, isBakedSvg } from './baking'

// Key management
export {
  validatePublicKey,
  generateKeyId,
  validateKeyId,
  publicKeyToMultibase,
  publicKeyToDidKey,
  generateDidKeyVerificationMethod,
  generateDidKeyMultikeyDocument,
  generateMultikeyDocument,
  didKeyToPublicKeyHex,
} from './keys'

// Encoding utilities
export {
  hexToBytes,
  bytesToHex,
  encodeBase58,
  decodeBase58,
  encodeMultibase,
  decodeMultibase,
  stringToBytes,
} from './encoding'

// API response generators
export {
  generateVerificationResponse,
  generateAchievementResponse,
  generateErrorResponse,
} from './outputs'

// Errors
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

// Types
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

// Constants
export { OB_CONTEXT } from './types'
