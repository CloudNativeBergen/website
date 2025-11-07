/**
 * API Response Generators
 *
 * Helpers to generate standardized OpenBadges 3.0 API responses.
 */

import type { SignedCredential, Achievement, ValidationResult } from './types'

/**
 * Generate a verification result response
 *
 * @param valid - Whether the credential is valid
 * @param credential - The credential that was verified
 * @param errors - Optional validation errors
 * @returns JSON response object
 */
export function generateVerificationResponse(
  valid: boolean,
  credential?: SignedCredential,
  errors?: ValidationResult['errors'],
): {
  valid: boolean
  credential?: SignedCredential
  errors?: ValidationResult['errors']
} {
  const response: {
    valid: boolean
    credential?: SignedCredential
    errors?: ValidationResult['errors']
  } = { valid }

  if (credential) {
    response.credential = credential
  }

  if (errors && errors.length > 0) {
    response.errors = errors
  }

  return response
}

/**
 * Generate an achievement response
 *
 * @param achievement - The achievement
 * @returns JSON response object
 */
export function generateAchievementResponse(
  achievement: Achievement,
): Achievement {
  return achievement
}

/**
 * Generate an error response
 *
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @param details - Optional error details
 * @returns JSON error response
 */
export function generateErrorResponse(
  message: string,
  statusCode: number,
  details?: Record<string, unknown>,
): {
  error: {
    message: string
    statusCode: number
    details?: Record<string, unknown>
  }
} {
  return {
    error: {
      message,
      statusCode,
      ...(details && { details }),
    },
  }
}
