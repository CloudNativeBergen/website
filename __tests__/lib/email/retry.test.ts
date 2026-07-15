/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isRateLimitError,
  isTransientError,
  retryWithBackoff,
} from '@/lib/email/config'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function withStatus(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number }
  err.status = status
  return err
}

describe('isTransientError', () => {
  it('treats rate limits as transient (superset of isRateLimitError)', () => {
    const rl = withStatus('Too many requests', 429)
    expect(isRateLimitError(rl)).toBe(true)
    expect(isTransientError(rl)).toBe(true)
  })

  it('matches HTTP 5xx responses', () => {
    expect(isTransientError(withStatus('boom', 500))).toBe(true)
    expect(isTransientError(withStatus('unavailable', 503))).toBe(true)
  })

  it('matches network-level error codes', () => {
    const err = new Error('socket problem') as Error & { code?: string }
    err.code = 'ECONNRESET'
    expect(isTransientError(err)).toBe(true)
  })

  it('matches transient Resend error names', () => {
    const err = new Error('provider blip') as Error & {
      resendErrorName?: string
    }
    err.resendErrorName = 'internal_server_error'
    expect(isTransientError(err)).toBe(true)
  })

  it('matches transient failure messages (fetch failed / timeouts)', () => {
    expect(isTransientError(new Error('fetch failed'))).toBe(true)
    expect(isTransientError(new Error('request timed out'))).toBe(true)
    expect(isTransientError(new Error('Bad Gateway'))).toBe(true)
  })

  it('unwraps a nested cause', () => {
    const inner = new Error('ETIMEDOUT') as Error & { code?: string }
    inner.code = 'ETIMEDOUT'
    const outer = new Error('wrapped') as Error & { cause?: unknown }
    outer.cause = inner
    expect(isTransientError(outer)).toBe(true)
  })

  it('does NOT treat permanent 4xx / validation errors as transient', () => {
    expect(isTransientError(withStatus('bad request', 400))).toBe(false)
    const validation = new Error('invalid to address') as Error & {
      resendErrorName?: string
    }
    validation.resendErrorName = 'validation_error'
    expect(isTransientError(validation)).toBe(false)
  })
})

describe('retryWithBackoff', () => {
  it('retries transient failures with the predicate and then succeeds', async () => {
    vi.useFakeTimers()
    let calls = 0
    const apiCall = vi.fn(async () => {
      calls++
      if (calls < 3) {
        throw withStatus('service unavailable', 503)
      }
      return 'ok'
    })

    const promise = retryWithBackoff(apiCall, 3, isTransientError)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(apiCall).toHaveBeenCalledTimes(3)
  })

  it('gives up after exhausting retries and rethrows the last error', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(async () => {
      throw withStatus('still unavailable', 503)
    })

    const promise = retryWithBackoff(apiCall, 3, isTransientError)
    // Attach a rejection handler before advancing timers to avoid an unhandled
    // rejection warning while the retries settle.
    const assertion = expect(promise).rejects.toThrow('still unavailable')
    await vi.runAllTimersAsync()
    await assertion
    expect(apiCall).toHaveBeenCalledTimes(3)
  })

  it('default predicate does NOT retry a non-rate-limit 5xx (preserves existing callers)', async () => {
    const apiCall = vi.fn(async () => {
      throw withStatus('server error', 500)
    })

    await expect(retryWithBackoff(apiCall)).rejects.toThrow('server error')
    // Rate-limit-only default: a 500 is thrown immediately, no retry.
    expect(apiCall).toHaveBeenCalledTimes(1)
  })
})
