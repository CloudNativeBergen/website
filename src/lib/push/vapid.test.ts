import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const setVapidDetailsMock = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
  },
}))

// A valid pair so isPushConfigured() is true and the subject branch is reached.
const VALID_KEY = 'x'.repeat(87)

function loadFresh() {
  // The module memoizes config state at module scope; reset between cases.
  vi.resetModules()
  return import('./vapid')
}

describe('VAPID subject de-hardcoding (CaaS #625)', () => {
  const OLD = {
    subject: process.env.VAPID_SUBJECT,
    pub: process.env.VAPID_PUBLIC_KEY,
    priv: process.env.VAPID_PRIVATE_KEY,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.VAPID_PUBLIC_KEY = VALID_KEY
    process.env.VAPID_PRIVATE_KEY = VALID_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [k, v] of [
      ['VAPID_SUBJECT', OLD.subject],
      ['VAPID_PUBLIC_KEY', OLD.pub],
      ['VAPID_PRIVATE_KEY', OLD.priv],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('configures web-push with the env subject when set', async () => {
    process.env.VAPID_SUBJECT = 'mailto:ops@example.test'
    const { getConfiguredWebPush, getWebPushConfigError } = await loadFresh()

    expect(getConfiguredWebPush()).not.toBeNull()
    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      'mailto:ops@example.test',
      VALID_KEY,
      VALID_KEY,
    )
    expect(getWebPushConfigError()).toBeNull()
  })

  it('fails loudly (no branded fallback) when VAPID_SUBJECT is unset', async () => {
    delete process.env.VAPID_SUBJECT
    const { getConfiguredWebPush, getWebPushConfigError } = await loadFresh()

    expect(getConfiguredWebPush()).toBeNull()
    expect(setVapidDetailsMock).not.toHaveBeenCalled()
    expect(getWebPushConfigError()).toMatch(/VAPID_SUBJECT is not set/)
  })
})
