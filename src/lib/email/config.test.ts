import { describe, it, expect, vi, afterEach } from 'vitest'
import { getResendClient, resolveEmailSender, resend } from './config'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('getResendClient', () => {
  it('returns the SAME cached platform client for the env credentials', () => {
    const a = getResendClient()
    const b = getResendClient()
    expect(a).toBe(b)
    // The exported `resend` is that same cached platform instance.
    expect(a).toBe(resend)
    // Explicitly passing the platform key resolves to the same cached client.
    expect(getResendClient({ apiKey: 'test_key' })).toBe(resend)
  })

  it('mints a DISTINCT client for a non-platform credential', () => {
    const orgClient = getResendClient({ apiKey: 're_org_key' })
    expect(orgClient).not.toBe(resend)
  })
})

describe('resolveEmailSender', () => {
  it('returns the cached platform client under the env fallback', async () => {
    const sender = await resolveEmailSender('org-a')
    expect(sender.client).toBe(resend)
    expect(sender.from).toBeUndefined()
  })

  it('returns a per-org client + From when a per-org email secret exists', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        'org-a': {
          email: { apiKey: 're_org_key', fallbackFrom: 'hello@org-a.no' },
        },
      }),
    )
    const sender = await resolveEmailSender('org-a')
    expect(sender.client).not.toBe(resend)
    expect(sender.from).toBe('hello@org-a.no')

    // A different org with no per-org secret still gets the platform default.
    const other = await resolveEmailSender('org-b')
    expect(other.client).toBe(resend)
  })
})
