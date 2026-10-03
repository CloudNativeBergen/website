/**
 * @vitest-environment node
 *
 * The contract-reminders cron (#1264): auth, the sweep query, and one
 * `sendContractReminderBySystem` per pending contract — sent, skipped and
 * thrown outcomes counted separately. The send itself is tested at the lib
 * seam (contract-communication.test.ts).
 */
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  remind: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...args: unknown[]) => h.fetch(...args) },
}))
vi.mock('@/lib/sponsor-crm/contract-communication', () => ({
  sendContractReminderBySystem: (...args: unknown[]) => h.remind(...args),
}))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

import { GET } from '@/app/api/cron/contract-reminders/route'

const request = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/contract-reminders', {
    headers: auth ? { authorization: auth } : {},
  })

describe('api/cron/contract-reminders', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterAll(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 without a bearer, and 500 without a configured secret', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(request('Bearer test-cron-secret'))).status).toBe(500)
    expect(h.remind).not.toHaveBeenCalled()
  })

  it('sweeps pending, over-threshold, under-limit contracts and sends one reminder each', async () => {
    h.fetch.mockResolvedValue([
      { _id: 'sfc-1', sponsorName: 'Acme' },
      { _id: 'sfc-2', sponsorName: 'Globex' },
    ])
    h.remind.mockResolvedValue({ ok: true, recipient: 'x@example.test' })

    const res = await GET(request('Bearer test-cron-secret'))
    expect(await res.json()).toEqual({
      success: true,
      total: 2,
      sent: 2,
      failed: 0,
    })
    expect(h.remind).toHaveBeenCalledWith('sfc-1')
    expect(h.remind).toHaveBeenCalledWith('sfc-2')
    const [query, params] = h.fetch.mock.calls[0]
    expect(query).toMatch(/signatureStatus == "pending"/)
    expect(query).toMatch(/reminderCount < \$maxReminders/)
    expect(params).toMatchObject({ maxReminders: 2 })
    // Threshold is "now minus 5 days", to the day.
    const threshold = new Date(params.threshold as string).getTime()
    expect(Math.round((Date.now() - threshold) / 86_400_000)).toBe(5)
  })

  it('counts a skipped and a thrown reminder as failed without stopping the sweep', async () => {
    h.fetch.mockResolvedValue([
      { _id: 'sfc-1', sponsorName: 'Acme' },
      { _id: 'sfc-2', sponsorName: 'Globex' },
      { _id: 'sfc-3', sponsorName: 'Initech' },
    ])
    h.remind
      .mockResolvedValueOnce({ ok: false, reason: 'signer-not-a-contact' })
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({ ok: true, recipient: 'c@initech.test' })

    const res = await GET(request('Bearer test-cron-secret'))
    expect(await res.json()).toEqual({
      success: true,
      total: 3,
      sent: 1,
      failed: 2,
    })
    expect(h.remind).toHaveBeenCalledTimes(3)
  })

  it('reports zero when nothing is pending', async () => {
    h.fetch.mockResolvedValue([])
    const res = await GET(request('Bearer test-cron-secret'))
    expect(await res.json()).toMatchObject({ success: true, sent: 0 })
    expect(h.remind).not.toHaveBeenCalled()
  })
})
