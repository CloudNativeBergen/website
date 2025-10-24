import { Resend } from 'resend'
import assert from 'assert'

if (process.env.NODE_ENV !== 'test') {
  assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
}

export const EMAIL_CONFIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || 'test_key',
  RATE_LIMIT_DELAY: 500,
  MAX_RETRIES: 3,
} as const

export const resend = new Resend(EMAIL_CONFIG.RESEND_API_KEY)

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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
        if (attempt === 0) {
          console.log(`Rate limit hit, implementing backoff strategy...`)
        }
        await delay(backoffDelay)
        continue
      }

      if (!isRateLimitError(error)) {
        throw error
      }
    }
  }

  if (isRateLimitError(lastError)) {
    console.error(
      `Rate limit backoff exhausted after ${maxRetries} attempts. This may indicate sustained high API usage.`,
    )
  }

  throw lastError
}

export interface EmailError {
  error: string
  status: number
}

export interface EmailResponse {
  message: string
  emailId?: string
  [key: string]: unknown
}

export type EmailResult<T = EmailResponse> = {
  data?: T
  error?: EmailError
}

export function createEmailError(
  message: string,
  status: number = 500,
): EmailError {
  return { error: message, status }
}
