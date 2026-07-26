import { Resend } from 'resend'
import assert from 'assert'
import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { EmailCredentials } from '@/lib/secrets/types'

if (process.env.NODE_ENV !== 'test') {
  assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
}

export const EMAIL_CONFIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || 'test_key',
  RATE_LIMIT_DELAY: 500,
  MAX_RETRIES: 3,
} as const

/**
 * Per-credentials Resend client factory with a CACHED platform-default instance
 * (CaaS #617). The platform-default client (the env `RESEND_API_KEY`) is built
 * once and reused; a caller that brings its own credentials gets a distinct
 * client, constructed lazily on demand. This replaces the former eager
 * module-scope singleton so a per-org tenant can send under its own Resend
 * account without touching any existing send path.
 */
let platformResend: Resend | undefined

export function getResendClient(credentials?: EmailCredentials): Resend {
  const apiKey = credentials?.apiKey || EMAIL_CONFIG.RESEND_API_KEY
  if (apiKey === EMAIL_CONFIG.RESEND_API_KEY) {
    return (platformResend ??= new Resend(EMAIL_CONFIG.RESEND_API_KEY))
  }
  return new Resend(apiKey)
}

/**
 * The platform-default Resend client. This is the SAME cached instance the
 * factory returns for the env credentials, so every existing send path that
 * imports `resend` keeps behaving identically. Per-org send paths should resolve
 * through {@link resolveEmailSender} instead.
 */
export const resend = getResendClient()

/** A resolved email sender: a Resend client plus an optional default From. */
export interface EmailSender {
  client: Resend
  /** Per-org default From address, when the tenant provides one. */
  from?: string
}

/**
 * Resolve the email sender for an organization (CaaS #617). A per-org email
 * secret (its own Resend key, optional From) wins; otherwise this returns the
 * cached platform-default client — so behavior is UNCHANGED until a tenant is
 * provisioned with its own credentials. The env fallback is intact via
 * {@link resolveTenantSecrets}'s default chain.
 */
export async function resolveEmailSender(
  orgId?: string | null,
): Promise<EmailSender> {
  const creds = await resolveTenantSecrets(orgId, 'email')
  if (creds?.apiKey) {
    return { client: getResendClient(creds), from: creds.fallbackFrom }
  }
  return { client: resend }
}

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
