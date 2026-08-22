/**
 * The client-side batcher that turns "one server action per widget" into one
 * server action per dashboard paint.
 *
 * The property that matters is NOT "batches things" — it is that the batch
 * contains exactly the widgets that asked. Every widget's own fetch gating
 * (no conference yet, a phase whose view is static, a widget filtered out of the
 * grid) lives in the widget, and a fetcher that is never called must never make
 * the server read that widget's data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const fetchDashboardData = vi.fn()
vi.mock('@/app/(admin)/admin/actions', () => ({
  fetchDashboardData: (keys: string[]) => fetchDashboardData(keys),
}))

import {
  fetchCFPHealth,
  fetchProposalPipeline,
  fetchTicketSales,
  requestWidgetData,
} from '@/lib/dashboard/fetchers'

beforeEach(() => {
  fetchDashboardData.mockReset()
})

describe('dashboard fetcher batching', () => {
  it('sends ONE call for the widgets of one paint', async () => {
    fetchDashboardData.mockResolvedValue({
      'cfp-health': { ok: true, value: { totalSubmissions: 7 } },
      'proposal-pipeline': { ok: true, value: { submitted: 3 } },
    })

    const [cfp, pipeline] = await Promise.all([
      fetchCFPHealth(),
      fetchProposalPipeline(),
    ])

    expect(fetchDashboardData).toHaveBeenCalledTimes(1)
    expect(fetchDashboardData.mock.calls[0][0].sort()).toEqual([
      'cfp-health',
      'proposal-pipeline',
    ])
    // Each caller gets ITS OWN slice, not the whole batch.
    expect(cfp).toEqual({ totalSubmissions: 7 })
    expect(pipeline).toEqual({ submitted: 3 })
  })

  it('asks only for widgets that actually called their fetcher', async () => {
    fetchDashboardData.mockResolvedValue({
      'cfp-health': { ok: true, value: {} },
    })

    await fetchCFPHealth()

    // The decisive assertion: a dashboard showing one widget must not read the
    // other twelve. This is what "compose" must not cost us.
    expect(fetchDashboardData).toHaveBeenCalledWith(['cfp-health'])
  })

  it('deduplicates two instances of the same widget into one key', async () => {
    fetchDashboardData.mockResolvedValue({
      'cfp-health': { ok: true, value: { totalSubmissions: 2 } },
    })

    const [a, b] = await Promise.all([fetchCFPHealth(), fetchCFPHealth()])

    expect(fetchDashboardData).toHaveBeenCalledTimes(1)
    expect(fetchDashboardData).toHaveBeenCalledWith(['cfp-health'])
    expect(a).toEqual({ totalSubmissions: 2 })
    expect(b).toEqual({ totalSubmissions: 2 })
  })

  it('starts a NEW batch for a later call (a retry, or a widget added later)', async () => {
    fetchDashboardData.mockResolvedValue({
      'cfp-health': { ok: true, value: {} },
    })

    await fetchCFPHealth()
    await fetchCFPHealth()

    expect(fetchDashboardData).toHaveBeenCalledTimes(2)
  })

  it('rejects ONLY the widget whose slice failed', async () => {
    fetchDashboardData.mockResolvedValue({
      'cfp-health': { ok: true, value: { totalSubmissions: 1 } },
      'ticket-sales': { ok: false, error: 'ticketing provider timed out' },
    })

    const results = await Promise.allSettled([
      fetchCFPHealth(),
      fetchTicketSales(),
    ])

    expect(results[0]).toMatchObject({ status: 'fulfilled' })
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({
        message: 'ticketing provider timed out',
      }),
    })
  })

  it('rejects a widget the server did not answer for, rather than resolving undefined', async () => {
    // Resolving `undefined` would render an empty card as if it were real data.
    fetchDashboardData.mockResolvedValue({})

    await expect(fetchCFPHealth()).rejects.toThrow(
      'No dashboard data returned for widget "cfp-health"',
    )
  })

  it('rejects every waiter when the call itself fails', async () => {
    fetchDashboardData.mockRejectedValue(new Error('network down'))

    const results = await Promise.allSettled([
      fetchCFPHealth(),
      fetchProposalPipeline(),
    ])

    for (const result of results) {
      expect(result).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ message: 'network down' }),
      })
    }
  })

  it('does not leak waiters between batches after a failure', async () => {
    fetchDashboardData.mockRejectedValueOnce(new Error('network down'))
    await expect(fetchCFPHealth()).rejects.toThrow('network down')

    fetchDashboardData.mockResolvedValue({
      'proposal-pipeline': { ok: true, value: { submitted: 5 } },
    })
    await expect(requestWidgetData('proposal-pipeline')).resolves.toEqual({
      submitted: 5,
    })
    expect(fetchDashboardData).toHaveBeenLastCalledWith(['proposal-pipeline'])
  })
})
