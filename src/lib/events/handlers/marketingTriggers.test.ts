/**
 * @vitest-environment node
 *
 * The Marketing Plan Trigger handlers: which events they act on and what they
 * ask the generation engine for. The engine itself is covered in
 * `src/lib/marketing/generation.test.ts`.
 */
const h = vi.hoisted(() => ({
  runGeneration: vi.fn(async () => ({ created: 3, warnings: [] })),
  getSignedSponsorSubject: vi.fn(),
}))
vi.mock('@/lib/marketing/generation', () => ({
  runGeneration: h.runGeneration,
}))
vi.mock('@/lib/marketing/generation-sanity', () => ({
  getSignedSponsorSubject: h.getSignedSponsorSubject,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Action, Status } from '@/lib/proposal/types'
import type {
  ProposalStatusChangeEvent,
  SponsorStatusChangeEvent,
} from '../types'
import {
  handleMarketingSpeakerConfirmed,
  handleMarketingSponsorSigned,
} from './marketingTriggers'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

const sponsorEvent = (
  next: SponsorStatusChangeEvent['next'],
  previous: SponsorStatusChangeEvent['previous'] = {
    status: 'negotiating',
    contractStatus: 'contract-sent',
  },
): SponsorStatusChangeEvent => ({
  eventType: 'sponsor.status.changed',
  timestamp: new Date(),
  conferenceId: 'conf-A',
  sponsorForConferenceId: 'sfc-1',
  previous,
  next,
  metadata: { source: 'test' },
})

describe('handleMarketingSponsorSigned', () => {
  const subject = {
    _id: 'sponsor-1',
    type: 'sponsor',
    values: { name: 'Acme' },
  }

  it('runs the sponsorSigned Trigger for the sponsor read back from Sanity', async () => {
    h.getSignedSponsorSubject.mockResolvedValue(subject)
    await handleMarketingSponsorSigned(
      sponsorEvent({
        status: 'negotiating',
        contractStatus: 'contract-signed',
      }),
    )
    expect(h.getSignedSponsorSubject).toHaveBeenCalledWith('conf-A', 'sfc-1')
    expect(h.runGeneration).toHaveBeenCalledWith('conf-A', [
      { kind: 'trigger', event: 'sponsorSigned', subjects: [subject] },
    ])
  })

  it('ignores changes that do not sign the sponsor', async () => {
    await handleMarketingSponsorSigned(
      sponsorEvent({ status: 'closed-lost', contractStatus: 'contract-sent' }),
    )
    expect(h.getSignedSponsorSubject).not.toHaveBeenCalled()
    expect(h.runGeneration).not.toHaveBeenCalled()
  })

  it('does nothing when the record is no longer signed', async () => {
    h.getSignedSponsorSubject.mockResolvedValue(null)
    await handleMarketingSponsorSigned(
      sponsorEvent({ status: 'closed-won', contractStatus: 'contract-sent' }),
    )
    expect(h.runGeneration).not.toHaveBeenCalled()
  })

  it('swallows and logs a failure', async () => {
    h.getSignedSponsorSubject.mockRejectedValue(new Error('sanity down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      handleMarketingSponsorSigned(
        sponsorEvent({ status: 'closed-won', contractStatus: null }),
      ),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })
})

describe('handleMarketingSpeakerConfirmed', () => {
  const event = (
    newStatus: Status,
    previousStatus: Status = Status.accepted,
  ): ProposalStatusChangeEvent =>
    ({
      eventType: 'proposal.status.changed',
      timestamp: new Date(),
      proposal: { _id: 'talk-1', title: 'Pods at scale' },
      previousStatus,
      newStatus,
      action: Action.confirm,
      conference: { _id: 'conf-A' },
      speakers: [
        { _id: 'sp-ada', name: 'Ada', title: 'Staff Engineer' },
        { _id: 'sp-grace', name: 'Grace' },
      ],
      metadata: {
        triggeredBy: { speakerId: 'sp-ada', isOrganizer: false },
        domain: 'x',
      },
    }) as unknown as ProposalStatusChangeEvent

  it('runs the speakerConfirmed Trigger for every speaker of the talk', async () => {
    await handleMarketingSpeakerConfirmed(event(Status.confirmed))
    expect(h.runGeneration).toHaveBeenCalledWith('conf-A', [
      {
        kind: 'trigger',
        event: 'speakerConfirmed',
        subjects: [
          {
            _id: 'sp-ada',
            type: 'speaker',
            values: {
              name: 'Ada',
              company: 'Staff Engineer',
              title: 'Pods at scale',
            },
          },
          {
            _id: 'sp-grace',
            type: 'speaker',
            values: { name: 'Grace', title: 'Pods at scale' },
          },
        ],
      },
    ])
  })

  it('ignores every other status', async () => {
    await handleMarketingSpeakerConfirmed(
      event(Status.accepted, Status.submitted),
    )
    await handleMarketingSpeakerConfirmed(
      event(Status.withdrawn, Status.confirmed),
    )
    expect(h.runGeneration).not.toHaveBeenCalled()
  })
})
