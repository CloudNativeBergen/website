import { Resend } from 'resend'
import assert from 'assert'

// Only assert in non-test environments
if (process.env.NODE_ENV !== 'test') {
  assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
}

/**
 * Shared Resend configuration and constants
 */
export const EMAIL_CONFIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || 'test_key',
  RATE_LIMIT_DELAY: 500, // 500ms delay = 2 requests per second max
  MAX_RETRIES: 3,
} as const

/**
 * Singleton Resend instance to avoid duplicate clients
 */
export const resend = new Resend(EMAIL_CONFIG.RESEND_API_KEY)

/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as { message?: string; status?: number }
  return (
    (typeof err.message === 'string' &&
      err.message.includes('Too many requests')) ||
    (typeof err.message === 'string' && err.message.includes('rate limit')) ||
    err.status === 429
  )
}

/**
 * Add a delay to respect rate limits
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry API call with exponential backoff for rate limit errors
 */
export async function retryWithBackoff<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = EMAIL_CONFIG.MAX_RETRIES,
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error

      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        const backoffDelay =
          EMAIL_CONFIG.RATE_LIMIT_DELAY * Math.pow(2, attempt)
        // Only log on the first retry attempt to reduce noise
        if (attempt === 0) {
          console.log(`Rate limit hit, implementing backoff strategy...`)
        }
        await delay(backoffDelay)
        continue
      }

      // If it's not a rate limit error, don't retry
      if (!isRateLimitError(error)) {
        throw error
      }
    }
  }

  // If we get here, we exhausted all retries for rate limit errors
  if (isRateLimitError(lastError)) {
    console.error(
      `Rate limit backoff exhausted after ${maxRetries} attempts. This may indicate sustained high API usage.`,
    )
  }

  throw lastError
}

/**
 * Standard email error response structure
 */
export interface EmailError {
  error: string
  status: number
}

/**
 * Standard email success response structure
 */
export interface EmailResponse {
  message: string
  emailId?: string
  [key: string]: unknown
}

/**
 * Result type for email operations
 */
export type EmailResult<T = EmailResponse> = {
  data?: T
  error?: EmailError
}

/**
 * Create a standardized email error response
 */
export function createEmailError(
  message: string,
  status: number = 500,
): EmailError {
  return { error: message, status }
}

/**
 * Create a standardized email success response
 */
export function createEmailResponse(
  message: string,
  emailId?: string,
  additionalData?: Record<string, unknown>,
): EmailResponse {
  return {
    message,
    emailId,
    ...additionalData,
  }
}
