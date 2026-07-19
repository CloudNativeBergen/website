/**
 * @vitest-environment node
 *
 * Unit tests for the notification-hub bus handler
 * (src/lib/events/handlers/persistNotification.ts).
 *
 * The data layer is mocked so we assert exactly which recipients get a
 * notification for each kind of proposal event:
 * - submit  → all organizers EXCEPT the actor
 * - accepted/rejected + shouldNotify → each proposal speaker EXCEPT the actor
 * - shouldNotify=false → nobody
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(async () => {}),
  getOrganizerSpeakerIds: vi.fn(async () => [] as string[]),
}))

import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { handlePersistNotification } from '@/lib/events/handlers/persistNotification'
import { Action, Status } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import type { NotificationInput } from '@/lib/notification/types'

type LooseMock = ReturnType<typeof vi.fn>
const createMock = createNotifications as unknown as LooseMock
const organizersMock = getOrganizerSpeakerIds as unknown as LooseMock

const makeEvent = (
  overrides: Partial<ProposalStatusChangeEvent> = {},
  metadataOverrides: Partial<ProposalStatusChangeEvent['metadata']> = {},
): ProposalStatusChangeEvent =>
  ({
    eventType: 'proposal.status.changed',
    timestamp: new Date(),
    proposal: { _id: 'prop-1', title: 'My Talk' },
    previousStatus: Status.submitted,
    newStatus: Status.accepted,
    action: Action.accept,
    conference: { _id: 'conf-1' },
    speakers: [],
    metadata: {
      triggeredBy: { speakerId: 'actor-1', isOrganizer: true },
      shouldNotify: true,
      domain: 'example.com',
      ...metadataOverrides,
    },
    ...overrides,
  }) as unknown as ProposalStatusChangeEvent

const lastItems = (): NotificationInput[] =>
  createMock.mock.calls[
    createMock.mock.calls.length - 1
  ][0] as NotificationInput[]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('submit — organizers minus actor', () => {
  it('notifies every organizer except the acting organizer', async () => {
    organizersMock.mockResolvedValue(['org-1', 'actor-1', 'org-2'])

    await handlePersistNotification(
      makeEvent({ action: Action.submit }, { shouldNotify: false }),
    )

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('proposal_submitted')
      expect(item.title).toBe('New proposal: "My Talk"')
      expect(item.link).toBe('/admin/proposals/prop-1')
      expect(item.actorId).toBe('actor-1')
      expect(item.relatedProposalId).toBe('prop-1')
      expect(item.conferenceId).toBe('conf-1')
    }
  })

  it('fires on submit regardless of shouldNotify (organizer routing is unconditional)', async () => {
    organizersMock.mockResolvedValue(['org-1'])
    await handlePersistNotification(
      makeEvent({ action: Action.submit }, { shouldNotify: false }),
    )
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(lastItems()).toHaveLength(1)
  })
})

describe('status change — speakers minus actor, gated by shouldNotify', () => {
  it('notifies each proposal speaker except the actor on an accepted+shouldNotify event', async () => {
    await handlePersistNotification(
      makeEvent({
        action: Action.accept,
        newStatus: Status.accepted,
        speakers: [
          { _id: 'sp-1' },
          { _id: 'actor-1' },
          { _id: 'sp-2' },
        ] as unknown as ProposalStatusChangeEvent['speakers'],
      }),
    )

    expect(organizersMock).not.toHaveBeenCalled()
    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['sp-1', 'sp-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('proposal_status_changed')
      expect(item.title).toContain('accepted')
      expect(item.link).toBe('/cfp/proposal/prop-1')
    }
  })

  it('carries metadata.comment as the message when present', async () => {
    await handlePersistNotification(
      makeEvent(
        {
          action: Action.reject,
          newStatus: Status.rejected,
          speakers: [
            { _id: 'sp-1' },
          ] as unknown as ProposalStatusChangeEvent['speakers'],
        },
        { comment: 'Not a fit this year' },
      ),
    )
    expect(lastItems()[0].message).toBe('Not a fit this year')
  })

  it('links to the #messages anchor when a decision comment is present (A7)', async () => {
    // A commented decision is ALSO relayed into the proposal thread, so the
    // status notification points at the same #messages anchor as the message
    // notification (they must not lead to two seemingly different places).
    await handlePersistNotification(
      makeEvent(
        {
          action: Action.accept,
          newStatus: Status.accepted,
          speakers: [
            { _id: 'sp-1' },
          ] as unknown as ProposalStatusChangeEvent['speakers'],
        },
        { comment: 'See you in Bergen!' },
      ),
    )
    expect(lastItems()[0].link).toBe('/cfp/proposal/prop-1#messages')
  })

  it('links to the bare proposal when there is no comment (A7)', async () => {
    await handlePersistNotification(
      makeEvent({
        action: Action.accept,
        newStatus: Status.accepted,
        speakers: [
          { _id: 'sp-1' },
        ] as unknown as ProposalStatusChangeEvent['speakers'],
      }),
    )
    expect(lastItems()[0].link).toBe('/cfp/proposal/prop-1')
  })

  it('does NOT notify when shouldNotify is false', async () => {
    await handlePersistNotification(
      makeEvent(
        {
          action: Action.accept,
          speakers: [
            { _id: 'sp-1' },
          ] as unknown as ProposalStatusChangeEvent['speakers'],
        },
        { shouldNotify: false },
      ),
    )
    expect(createMock).not.toHaveBeenCalled()
  })

  it('does NOT notify the proposal speakers for confirm/withdraw (that is organizer routing)', async () => {
    // confirm/withdraw are not in the speaker-notify action set — they route to
    // organizers instead (asserted below), never to the proposal speakers.
    organizersMock.mockResolvedValue(['org-1'])
    await handlePersistNotification(
      makeEvent({
        action: Action.withdraw,
        newStatus: Status.withdrawn,
        speakers: [
          { _id: 'sp-1' },
        ] as unknown as ProposalStatusChangeEvent['speakers'],
      }),
    )
    // The proposal speaker (sp-1) is never a recipient — only organizers are.
    const recipients = lastItems().map((i) => i.recipientId)
    expect(recipients).not.toContain('sp-1')
    expect(recipients).toEqual(['org-1'])
  })
})

describe('confirm / withdraw — organizers minus actor', () => {
  it('notifies every organizer except the actor when a speaker confirms', async () => {
    organizersMock.mockResolvedValue(['org-1', 'actor-1', 'org-2'])

    await handlePersistNotification(
      makeEvent(
        { action: Action.confirm, newStatus: Status.confirmed },
        { shouldNotify: false },
      ),
    )

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('proposal_status_changed')
      expect(item.title).toBe('Speaker confirmed: "My Talk"')
      expect(item.link).toBe('/admin/proposals/prop-1')
      expect(item.actorId).toBe('actor-1')
      expect(item.relatedProposalId).toBe('prop-1')
      expect(item.conferenceId).toBe('conf-1')
      expect(item.message).toBeUndefined()
    }
  })

  it('titles a withdrawal and carries metadata.reason as the message', async () => {
    organizersMock.mockResolvedValue(['org-1'])

    await handlePersistNotification(
      makeEvent(
        { action: Action.withdraw, newStatus: Status.withdrawn },
        { reason: 'Speaker fell ill' },
      ),
    )

    expect(createMock).toHaveBeenCalledTimes(1)
    const item = lastItems()[0]
    expect(item.recipientId).toBe('org-1')
    expect(item.title).toBe('Proposal withdrawn: "My Talk"')
    expect(item.message).toBe('Speaker fell ill')
    expect(item.link).toBe('/admin/proposals/prop-1')
  })

  it('omits the message when a withdrawal has no reason', async () => {
    organizersMock.mockResolvedValue(['org-1'])

    await handlePersistNotification(
      makeEvent({ action: Action.withdraw, newStatus: Status.withdrawn }),
    )

    expect(lastItems()[0].message).toBeUndefined()
  })

  it('fires on confirm/withdraw regardless of shouldNotify', async () => {
    organizersMock.mockResolvedValue(['org-1'])
    await handlePersistNotification(
      makeEvent(
        { action: Action.confirm, newStatus: Status.confirmed },
        { shouldNotify: false },
      ),
    )
    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
