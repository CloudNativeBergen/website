import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The badge sender goes through the shared client in `@/lib/email/config`,
// which constructs its Resend at module load — so mock the package itself and
// capture the send payload.
const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) }
  },
}))

const updateStatusMock = vi.fn()
vi.mock('@/lib/badge/sanity', () => ({
  updateBadgeEmailStatus: (...args: unknown[]) => updateStatusMock(...args),
}))

import { sendBadgeEmail } from './badge'

const badge = {
  badgeId: 'BADGE123',
  badgeType: 'speaker',
} as never

const baseParams = {
  badge,
  speakerEmail: 'speaker@example.com',
  speakerName: 'Ada Lovelace',
  conferenceName: 'Cloud Native Bergen',
  conferenceYear: '2099',
}

beforeEach(() => {
  vi.clearAllMocks()
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  updateStatusMock.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('sendBadgeEmail download URL', () => {
  it('builds the download link from the conference OWN domain', async () => {
    const result = await sendBadgeEmail({
      ...baseParams,
      conference: { domains: ['cloudnativebergen.no'] } as never,
    })

    expect(result.success).toBe(true)
    const html = sendMock.mock.calls[0][0].html as string
    expect(html).toContain(
      'https://cloudnativebergen.no/api/badge/BADGE123/download',
    )
  })

  it('never emits a localhost link, even in production with no global base URL', async () => {
    // Reproduces the reported bug's environment: production, NEXT_PUBLIC_BASE_URL
    // absent in the send context. The old code degraded to http://localhost:3000.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')

    await sendBadgeEmail({
      ...baseParams,
      conference: { domains: ['2099.cloudnativedays.no'] } as never,
    })

    const html = sendMock.mock.calls[0][0].html as string
    expect(html).not.toContain('localhost')
    expect(html).toContain(
      'https://2099.cloudnativedays.no/api/badge/BADGE123/download',
    )
  })
})
