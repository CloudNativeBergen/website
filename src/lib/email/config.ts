import { Resend } from 'resend'
import assert from 'assert'
import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { EmailCredentials } from '@/lib/secrets/types'
import { instrumentResendClient } from './instrument'

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
 *
 * EVERY client handed out here is instrumented (`instrumentResendClient`): the
 * sender policy and failure logging live on the client, not on the call sites,
 * so neither can be bypassed by a send path that forgot about them. The PLATFORM
 * client enforces the From policy (platform#20); a client built from a tenant's
 * OWN credentials does not — its domains are verified on its own account — but
 * it still logs every failure.
 */
let platformResend: Resend | undefined

export function getResendClient(
  credentials?: EmailCredentials,
  context?: { orgId?: string | null },
): Resend {
  const apiKey = credentials?.apiKey || EMAIL_CONFIG.RESEND_API_KEY
  if (apiKey === EMAIL_CONFIG.RESEND_API_KEY) {
    // Deliberately NOT `context.orgId`: this instance is SHARED by every tenant,
    // so an org captured from whoever happened to construct it first would
    // mislabel every later tenant's failure log. The tenant is identified there
    // by its From/Reply-To instead.
    return (platformResend ??= instrumentResendClient(
      new Resend(EMAIL_CONFIG.RESEND_API_KEY),
      { enforceSenderPolicy: true },
    ))
  }
  return instrumentResendClient(new Resend(apiKey), {
    orgId: context?.orgId,
    enforceSenderPolicy: false,
  })
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
 *
 * IT REJECTS RATHER THAN GUESSING (RunKonf/platform#57). The `return { client:
 * resend }` below is not a neutral default — it is the PLATFORM Resend account,
 * reached by any org the chain answers `null` for. So an indeterminate lookup
 * must not reach it: when the secret chain cannot determine whether this tenant
 * has its own credentials, it raises `TenantEnvSlugUnavailableError` and this
 * function PROPAGATES it, failing the send loudly instead of quietly moving the
 * tenant's mail onto the platform account (dedicated sending off, sender policy
 * back on, nobody paged). Every caller already treats a rejected send as a
 * failure; none of them fall back to `resend` on their own.
 *
 * @throws when the tenant's credential binding cannot be determined.
 */
export async function resolveEmailSender(
  orgId?: string | null,
): Promise<EmailSender> {
  const creds = await resolveTenantSecrets(orgId, 'email')
  if (creds?.apiKey) {
    return {
      client: getResendClient(creds, { orgId }),
      from: creds.fallbackFrom,
    }
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

/**
 * Node/undici network-level error codes that indicate a transient failure the
 * caller should retry rather than surface immediately.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

/**
 * Resend `error.name` values that map to server-side / transient failures.
 */
const TRANSIENT_RESEND_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'internal_server_error',
  'application_error',
])

/**
 * Broader retry predicate than {@link isRateLimitError}: also matches HTTP 5xx
 * responses and network-level failures (connection resets, timeouts, DNS
 * hiccups, `fetch failed`). Use this for sends where a transient provider or
 * network blip must not be treated as a permanent failure. Rate-limit errors
 * remain a subset, so existing backoff behaviour is preserved.
 */
export function isTransientError(error: unknown): boolean {
  if (isRateLimitError(error)) {
    return true
  }

  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as {
    message?: string
    status?: number
    statusCode?: number
    code?: string
    name?: string
    resendErrorName?: string
    cause?: unknown
  }

  const status = err.status ?? err.statusCode
  if (typeof status === 'number' && status >= 500 && status <= 599) {
    return true
  }

  if (typeof err.code === 'string' && TRANSIENT_NETWORK_CODES.has(err.code)) {
    return true
  }

  const resendName = err.resendErrorName ?? err.name
  if (
    typeof resendName === 'string' &&
    TRANSIENT_RESEND_ERROR_NAMES.has(resendName)
  ) {
    return true
  }

  const message =
    typeof err.message === 'string' ? err.message.toLowerCase() : ''
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('service unavailable') ||
    message.includes('bad gateway') ||
    message.includes('gateway timeout')
  ) {
    return true
  }

  // undici and other fetch layers commonly nest the real cause.
  if (err.cause && err.cause !== error) {
    return isTransientError(err.cause)
  }

  return false
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function retryWithBackoff<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = EMAIL_CONFIG.MAX_RETRIES,
  shouldRetry: (error: unknown) => boolean = isRateLimitError,
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error

      if (shouldRetry(error) && attempt < maxRetries - 1) {
        const backoffDelay =
          EMAIL_CONFIG.RATE_LIMIT_DELAY * Math.pow(2, attempt)
        if (attempt === 0) {
          console.log(
            isRateLimitError(error)
              ? `Rate limit hit, implementing backoff strategy...`
              : `Transient email failure, retrying with backoff...`,
          )
        }
        await delay(backoffDelay)
        continue
      }

      if (!shouldRetry(error)) {
        throw error
      }
    }
  }

  if (shouldRetry(lastError)) {
    console.error(
      `Email retry backoff exhausted after ${maxRetries} attempts. This may indicate sustained provider or network problems.`,
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
