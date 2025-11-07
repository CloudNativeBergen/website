/**
 * OpenBadges Error System
 *
 * Comprehensive error handling with fail-fast validation and detailed context.
 */

export const ERROR_CODES = {
  // Configuration errors
  INVALID_ISSUER_PROFILE: 'INVALID_ISSUER_PROFILE',
  INVALID_SIGNING_CONFIG: 'INVALID_SIGNING_CONFIG',
  INVALID_ACHIEVEMENT_CONFIG: 'INVALID_ACHIEVEMENT_CONFIG',
  INVALID_SUBJECT_PROFILE: 'INVALID_SUBJECT_PROFILE',
  INVALID_CREDENTIAL_CONFIG: 'INVALID_CREDENTIAL_CONFIG',

  // Cryptographic errors
  SIGNING_FAILED: 'SIGNING_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',

  // Key errors
  INVALID_KEY_FORMAT: 'INVALID_KEY_FORMAT',
  INVALID_MULTIBASE: 'INVALID_MULTIBASE',
  KEY_LENGTH_MISMATCH: 'KEY_LENGTH_MISMATCH',

  // Encoding errors
  INVALID_HEX: 'INVALID_HEX',
  INVALID_BASE58: 'INVALID_BASE58',
  ENCODING_FAILED: 'ENCODING_FAILED',
  DECODING_FAILED: 'DECODING_FAILED',

  // Validation errors
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Baking errors
  BAKING_FAILED: 'BAKING_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  INVALID_SVG: 'INVALID_SVG',
  MISSING_CREDENTIAL: 'MISSING_CREDENTIAL',

  // General errors
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * Base OpenBadges error class
 */
export class OpenBadgesError extends Error {
  public readonly code: ErrorCode
  public readonly context?: Record<string, unknown>

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'OpenBadgesError'
    this.code = code
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.CONFIGURATION_ERROR, message, context)
    this.name = 'ConfigurationError'
  }
}

/**
 * Cryptographic signing error
 */
export class SigningError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.SIGNING_FAILED, message, context)
    this.name = 'SigningError'
  }
}

/**
 * Signature verification error
 */
export class VerificationError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.VERIFICATION_FAILED, message, context)
    this.name = 'VerificationError'
  }
}

/**
 * Schema validation error
 */
export class ValidationError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.SCHEMA_VALIDATION_FAILED, message, context)
    this.name = 'ValidationError'
  }
}

/**
 * Badge baking error
 */
export class BakingError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.BAKING_FAILED, message, context)
    this.name = 'BakingError'
  }
}

/**
 * Badge extraction error
 */
export class ExtractionError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.EXTRACTION_FAILED, message, context)
    this.name = 'ExtractionError'
  }
}

/**
 * Key format error
 */
export class KeyFormatError extends OpenBadgesError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(ERROR_CODES.INVALID_KEY_FORMAT, message, context)
    this.name = 'KeyFormatError'
  }
}

/**
 * Encoding/decoding error
 */
export class EncodingError extends OpenBadgesError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(code, message, context)
    this.name = 'EncodingError'
  }
}
