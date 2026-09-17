import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  expansion: vi.fn(),
  redate: vi.fn(),
  eligible: vi.fn(),
}))
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))
vi.mock('@/lib/marketing/expansion-run', () => ({
  resolveExpansionConferences: async () => [],
  runPlanExpansion: h.expansion,
}))
vi.mock('@/lib/marketing/redate-run', () => ({
  resolveRedateConferences: h.eligible,
  redatePlanForConference: h.redate,
}))
import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.clearAllMocks()
  h.eligible.mockResolvedValue([
    { planId: 'plan-old', conferenceId: 'conf-old' },
  ])
  h.redate.mockResolvedValue({
    movedTaskIds: ['recording-task'],
    movedVariantIds: ['recording-variant'],
    warnings: ['Bluesky exceeds its daily ceiling'],
  })
})
afterEach(() => vi.unstubAllEnvs())

it('re-dates a plan even when no edition qualifies for expansion', async () => {
  const response = await GET(
    new Request('https://example.org/api/cron/marketing-expansion', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as Parameters<typeof GET>[0],
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    success: true,
    redates: [
      {
        conferenceId: 'conf-old',
        movedTaskIds: ['recording-task'],
        movedVariantIds: ['recording-variant'],
        warnings: ['Bluesky exceeds its daily ceiling'],
      },
    ],
  })
  expect(h.redate).toHaveBeenCalledWith('conf-old')
})
