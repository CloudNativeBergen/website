import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSlackNotification } from './slackNotification'
import { notifyProposalStatusChange } from '@/lib/slack/notify'
import { Action } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'

vi.mock('@/lib/slack/notify', () => ({
  notifyProposalStatusChange: vi.fn().mockResolvedValue(undefined),
  notifyNewProposal: vi.fn().mockResolvedValue(undefined),
}))

const selfWithdraw = (
  ticketCancellation?: ProposalStatusChangeEvent['metadata']['ticketCancellation'],
) =>
  ({
    action: Action.withdraw,
    proposal: { _id: 'p1' },
    conference: { _id: 'c1' },
    metadata: {
      triggeredBy: { speakerId: 's1', isOrganizer: false },
      postedToThread: true,
      reason: 'Ill',
      ticketCancellation,
    },
  }) as unknown as ProposalStatusChangeEvent

describe('handleSlackNotification, speaker self-withdraw', () => {
  beforeEach(() => vi.mocked(notifyProposalStatusChange).mockClear())

  it('posts nothing when the thread message already reached Slack', async () => {
    await handleSlackNotification(selfWithdraw())
    expect(notifyProposalStatusChange).not.toHaveBeenCalled()
  })

  it('posts the alert once when there are tickets to cancel by hand', async () => {
    const tickets = {
      speakers: [{ name: 'Ada', email: 'ada@example.com' }],
      unfiltered: false,
    }
    await handleSlackNotification(selfWithdraw(tickets))
    expect(notifyProposalStatusChange).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyProposalStatusChange).mock.calls[0][5]).toBe(tickets)
  })
})
