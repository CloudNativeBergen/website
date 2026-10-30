import { describe, it, expect, vi } from 'vitest'

const send = vi.fn<(payload: unknown) => Promise<unknown>>(async () => ({}))
vi.mock('@/lib/proposal/server', () => ({
  sendAcceptRejectNotification: (payload: unknown) => send(payload),
}))

import { handleEmailNotification } from './emailNotification'
import { Action } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'

describe('handleEmailNotification', () => {
  it('links to the conference domain, not the request host', async () => {
    await handleEmailNotification({
      action: Action.accept,
      proposal: { _id: 'p1', title: 'Talk' },
      conference: {
        title: 'Conf',
        domains: ['conf.example'],
        startDate: '2026-06-01',
      },
      speakers: [{ _id: 's1', name: 'Ada', email: 'ada@example.com' }],
      metadata: {
        shouldNotify: true,
        triggeredBy: { speakerId: 'o1', isOrganizer: true },
        domain: 'admin.internal:3000',
      },
    } as unknown as ProposalStatusChangeEvent)

    const params = send.mock.calls[0][0] as { event: { url: string } }
    expect(params.event.url).toBe('https://conf.example')
  })
})
