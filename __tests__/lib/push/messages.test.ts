import { describe, it, expect } from 'vitest'
import {
  categoryForAction,
  buildProposalStatusMessage,
  buildCoSpeakerInviteMessage,
  proposalUrl,
} from '@/lib/push/messages'
import { Action } from '@/lib/proposal/types'

describe('categoryForAction', () => {
  it('maps decision actions to proposalDecisions', () => {
    expect(categoryForAction(Action.accept)).toBe('proposalDecisions')
    expect(categoryForAction(Action.reject)).toBe('proposalDecisions')
    expect(categoryForAction(Action.waitlist)).toBe('proposalDecisions')
  })

  it('maps confirm to talkConfirmed', () => {
    expect(categoryForAction(Action.confirm)).toBe('talkConfirmed')
  })

  it('returns null for non-push actions', () => {
    expect(categoryForAction(Action.submit)).toBeNull()
    expect(categoryForAction(Action.withdraw)).toBeNull()
    expect(categoryForAction(Action.view)).toBeNull()
    expect(categoryForAction(Action.remind)).toBeNull()
  })
})

describe('buildProposalStatusMessage', () => {
  const base = {
    proposalId: 'proposal-1',
    proposalTitle: 'Kubernetes at Scale',
    conferenceTitle: 'Cloud Native Day',
  }

  it('builds an accept message with a deep link', () => {
    const message = buildProposalStatusMessage({
      ...base,
      action: Action.accept,
    })
    expect(message).not.toBeNull()
    expect(message!.title).toContain('accepted')
    expect(message!.body).toContain('Kubernetes at Scale')
    expect(message!.url).toBe('/cfp/proposal/proposal-1')
  })

  it('builds a confirm message', () => {
    const message = buildProposalStatusMessage({
      ...base,
      action: Action.confirm,
    })
    expect(message!.title).toContain('confirmed')
    expect(message!.url).toBe(proposalUrl('proposal-1'))
  })

  it('returns null for a non-push action', () => {
    expect(
      buildProposalStatusMessage({ ...base, action: Action.submit }),
    ).toBeNull()
  })
})

describe('buildCoSpeakerInviteMessage', () => {
  it('names the inviter and the talk, links to the dashboard', () => {
    const message = buildCoSpeakerInviteMessage({
      inviterName: 'Ada Lovelace',
      proposalTitle: 'Analytical Engines',
    })
    expect(message.body).toContain('Ada Lovelace')
    expect(message.body).toContain('Analytical Engines')
    expect(message.url).toBe('/cfp/list')
  })
})
