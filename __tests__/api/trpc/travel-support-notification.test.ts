/**
 * @vitest-environment node
 *
 * Tests the in-app notification fan-out emitted inline by the travel-support
 * router (src/server/routers/travelSupport.ts):
 * - `submit`            → all organizers EXCEPT the actor
 * - `admin.updateStatus`→ the affected speaker, gated to approved/rejected/paid
 *
 * The notification and travel-support data layers are mocked so we assert the
 * exact recipients/types and that a failing id fetch never escapes the mutation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import {
  getTravelSupportById,
  submitTravelSupport,
  updateTravelSupportStatus,
  updateExpenseStatus,
  getTravelExpenseRef,
} from '@/lib/travel-support/sanity'
import { authorizeTravelSupportOperation } from '@/lib/travel-support/auth'
import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { TravelSupportStatus, ExpenseStatus } from '@/lib/travel-support/types'
import type { NotificationInput } from '@/lib/notification/types'

vi.mock('@/lib/travel-support/sanity')
vi.mock('@/lib/travel-support/auth')
vi.mock('@/lib/notification/sanity')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))

const actor = {
  _id: 'actor-1',
  name: 'Acting Organizer',
  email: 'org@test.com',
  isOrganizer: true,
}

const bankingDetails = {
  beneficiaryName: 'Jane Speaker',
  bankName: 'Bank',
  swiftCode: 'SWIFT',
  country: 'NO',
  iban: 'NO123',
}

const createCaller = (speaker: typeof actor) =>
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
  vi.mocked(createNotifications).mockResolvedValue(undefined)
  vi.mocked(getOrganizerSpeakerIds).mockResolvedValue([
    'org-1',
    'actor-1',
    'org-2',
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('travelSupport.submit — organizer notifications', () => {
  beforeEach(() => {
    vi.mocked(authorizeTravelSupportOperation).mockResolvedValue({
      authorized: true,
      travelSupport: {
        _id: 'ts-1',
        status: TravelSupportStatus.DRAFT,
        bankingDetails,
        speaker: { _id: 'sp-1', name: 'Jane Speaker', email: 'j@test.com' },
        conference: { _id: 'conf-1', name: 'Test Conf' },
      } as never,
    })
    vi.mocked(submitTravelSupport).mockResolvedValue({
      success: true,
      error: null,
    } as never)
  })

  it('notifies every organizer except the actor with the right shape', async () => {
    await createCaller(actor).travelSupport.submit({ travelSupportId: 'ts-1' })

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('travel_support_update')
      expect(item.title).toBe('Travel support request from Acting Organizer')
      expect(item.link).toBe('/admin/speakers/travel-support?request=ts-1')
      expect(item.actorId).toBe('actor-1')
      expect(item.conferenceId).toBe('conf-1')
    }
  })

  it('does not fail the submission when the organizer-id fetch throws', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockRejectedValue(new Error('boom'))

    const result = await createCaller(actor).travelSupport.submit({
      travelSupportId: 'ts-1',
    })

    expect(result).toEqual({ success: true })
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('travelSupport.admin.updateStatus — affected-speaker notifications', () => {
  const mockFetched = (status: TravelSupportStatus, speakerId = 'sp-1') =>
    vi.mocked(getTravelSupportById).mockResolvedValue({
      travelSupport: {
        _id: 'ts-1',
        status: TravelSupportStatus.SUBMITTED,
        speaker: { _id: speakerId, name: 'Jane Speaker', email: 'j@test.com' },
        conference: { _id: 'conf-1', name: 'Test Conf' },
        expenses: [],
      } as never,
      error: null,
    })

  beforeEach(() => {
    vi.mocked(authorizeTravelSupportOperation).mockResolvedValue({
      authorized: true,
    } as never)
    vi.mocked(updateTravelSupportStatus).mockResolvedValue({
      success: true,
      error: null,
    } as never)
  })

  it('notifies the affected speaker on approval, carrying reviewNotes as message', async () => {
    mockFetched(TravelSupportStatus.APPROVED)

    await createCaller(actor).travelSupport.admin.updateStatus({
      travelSupportId: 'ts-1',
      status: TravelSupportStatus.APPROVED,
      reviewNotes: 'Looks good',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const item = lastItems()[0]
    expect(item.recipientId).toBe('sp-1')
    expect(item.notificationType).toBe('travel_support_update')
    expect(item.title).toBe('Travel support approved')
    expect(item.message).toBe('Looks good')
    expect(item.link).toBe('/cfp/expense')
    expect(item.actorId).toBe('actor-1')
  })

  it.each([
    [TravelSupportStatus.REJECTED, 'Travel support rejected'],
    [TravelSupportStatus.PAID, 'Travel support marked paid'],
  ])('maps %s to a human title', async (status, title) => {
    mockFetched(status)
    await createCaller(actor).travelSupport.admin.updateStatus({
      travelSupportId: 'ts-1',
      status,
    })
    expect(lastItems()[0].title).toBe(title)
  })

  it.each([TravelSupportStatus.DRAFT, TravelSupportStatus.SUBMITTED])(
    'does NOT notify for the %s echo status',
    async (status) => {
      mockFetched(status)
      await createCaller(actor).travelSupport.admin.updateStatus({
        travelSupportId: 'ts-1',
        status,
      })
      expect(createMock).not.toHaveBeenCalled()
    },
  )

  it('does NOT notify when the affected speaker is the actor', async () => {
    mockFetched(TravelSupportStatus.APPROVED, 'actor-1')
    await createCaller(actor).travelSupport.admin.updateStatus({
      travelSupportId: 'ts-1',
      status: TravelSupportStatus.APPROVED,
    })
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('travelSupport.admin.updateExpenseStatus — affected-speaker notifications', () => {
  const mockOwner = (speakerId = 'sp-1') => {
    vi.mocked(getTravelExpenseRef).mockResolvedValue({
      travelSupport: { _ref: 'ts-1' },
    })
    vi.mocked(getTravelSupportById).mockResolvedValue({
      travelSupport: {
        _id: 'ts-1',
        status: TravelSupportStatus.SUBMITTED,
        speaker: { _id: speakerId, name: 'Jane Speaker', email: 'j@test.com' },
        conference: { _id: 'conf-1', name: 'Test Conf' },
        expenses: [],
      } as never,
      error: null,
    })
  }

  beforeEach(() => {
    vi.mocked(updateExpenseStatus).mockResolvedValue({
      success: true,
      error: null,
    } as never)
  })

  it('notifies the affected speaker when an expense is approved, carrying reviewNotes', async () => {
    mockOwner()

    await createCaller(actor).travelSupport.admin.updateExpenseStatus({
      expenseId: 'exp-1',
      status: ExpenseStatus.APPROVED,
      reviewNotes: 'Within policy',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const item = lastItems()[0]
    expect(item.recipientId).toBe('sp-1')
    expect(item.notificationType).toBe('travel_support_update')
    expect(item.title).toBe('Expense approved')
    expect(item.message).toBe('Within policy')
    expect(item.link).toBe('/cfp/expense')
    expect(item.actorId).toBe('actor-1')
    expect(item.conferenceId).toBe('conf-1')
  })

  it('titles a rejected expense', async () => {
    mockOwner()
    await createCaller(actor).travelSupport.admin.updateExpenseStatus({
      expenseId: 'exp-1',
      status: ExpenseStatus.REJECTED,
    })
    expect(lastItems()[0].title).toBe('Expense rejected')
  })

  it('does NOT notify for the pending echo status', async () => {
    mockOwner()
    await createCaller(actor).travelSupport.admin.updateExpenseStatus({
      expenseId: 'exp-1',
      status: ExpenseStatus.PENDING,
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('does NOT notify when the affected speaker is the actor', async () => {
    mockOwner('actor-1')
    await createCaller(actor).travelSupport.admin.updateExpenseStatus({
      expenseId: 'exp-1',
      status: ExpenseStatus.APPROVED,
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('does not fail the mutation when the owner lookup throws', async () => {
    vi.mocked(getTravelExpenseRef).mockRejectedValue(new Error('boom'))

    const result = await createCaller(
      actor,
    ).travelSupport.admin.updateExpenseStatus({
      expenseId: 'exp-1',
      status: ExpenseStatus.APPROVED,
    })

    expect(result).toEqual({ success: true })
    expect(createMock).not.toHaveBeenCalled()
  })
})
