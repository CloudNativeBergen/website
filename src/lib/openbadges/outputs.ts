import type { SignedCredential, Achievement, ValidationResult } from './types'

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

export function generateAchievementResponse(
  achievement: Achievement,
): Achievement {
  return achievement
}

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
