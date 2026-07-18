/**
 * @vitest-environment node
 *
 * Tests the in-app notification fan-out emitted inline by
 * `sponsor.crm.moveStage` (src/server/routers/sponsor.ts). The notification
 * data layer is mocked so we assert exactly which organizers are notified, and
 * that a failing organizer-id fetch never escapes the mutation path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  getSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import { logStageChange } from '@/lib/sponsor-crm/activity'
import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { NotificationInput } from '@/lib/notification/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/notification/sanity')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))

const mockOrganizer = {
  _id: 'actor-1',
  name: 'Acting Organizer',
  email: 'org@test.com',
  isOrganizer: true,
}
const mockConference = { _id: 'conf-1', title: 'Test Conf' }

function makeSfc(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '',
    _updatedAt: '',
    sponsor: {
      _id: 's1',
      name: 'Acme',
      website: 'https://acme.test',
      logo: '',
    },
    conference: { _id: 'conf-1', title: 'Test Conf' },
    contractStatus: 'none',
    status: 'negotiating',
    contractCurrency: 'NOK',
    invoiceStatus: 'not-sent',
    ...overrides,
  } as SponsorForConferenceExpanded
}

const createCaller = (speaker: typeof mockOrganizer) =>
  appRouter.createCaller({
    session: { user: { email: speaker.email }, speaker },
    speaker,
    user: { email: speaker.email },
  } as unknown as Parameters<typeof appRouter.createCaller>[0])

const createMock = createNotifications as unknown as ReturnType<typeof vi.fn>
const lastItems = (): NotificationInput[] =>
  createMock.mock.calls[
    createMock.mock.calls.length - 1
  ][0] as NotificationInput[]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: mockConference as never,
    domain: 'test.com',
    error: null,
  })
  vi.mocked(getSponsorForConference).mockResolvedValue({
    sponsorForConference: makeSfc(),
    error: undefined,
  })
  vi.mocked(updateSponsorForConference).mockResolvedValue({
    sponsorForConference: makeSfc({ status: 'closed-lost' }),
    error: undefined,
  })
  vi.mocked(logStageChange).mockResolvedValue(undefined as never)
  vi.mocked(getOrganizerSpeakerIds).mockResolvedValue([
    'org-1',
    'actor-1',
    'org-2',
  ])
  vi.mocked(createNotifications).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sponsor.crm.moveStage — organizer notifications', () => {
  it('notifies every organizer except the acting organizer', async () => {
    await createCaller(mockOrganizer).sponsor.crm.moveStage({
      id: 'sfc-1',
      newStatus: 'closed-lost',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('sponsor_activity')
      expect(item.title).toBe('Sponsor Acme moved to closed-lost')
      expect(item.link).toBe('/admin/sponsors/crm?sponsor=sfc-1')
      expect(item.actorId).toBe('actor-1')
      expect(item.conferenceId).toBe('conf-1')
    }
  })

  it('falls back to a generic title when the sponsor name is missing', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        sponsor: undefined as never,
      }),
      error: undefined,
    })

    await createCaller(mockOrganizer).sponsor.crm.moveStage({
      id: 'sfc-1',
      newStatus: 'closed-lost',
    })

    expect(lastItems()[0].title).toBe('Sponsor moved to closed-lost')
  })

  it('does not fail the stage move when the organizer-id fetch throws', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockRejectedValue(new Error('boom'))

    const result = await createCaller(mockOrganizer).sponsor.crm.moveStage({
      id: 'sfc-1',
      newStatus: 'closed-lost',
    })

    // Mutation still succeeds; the notification failure is swallowed.
    expect(result).toBeDefined()
    expect(createMock).not.toHaveBeenCalled()
  })
})
