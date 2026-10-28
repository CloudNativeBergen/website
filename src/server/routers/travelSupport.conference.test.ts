/**
 * @vitest-environment node
 *
 * `getMine` and `create` take a `conferenceId` from the dashboard card (B3,
 * #1546). An id the resolver rejects (other org, or no talk there) must be
 * NOT_FOUND, never a silent fallback to another conference.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/travel-support/sanity', () => ({
  getTravelSupport: vi.fn(),
  getTravelSupportById: vi.fn(),
  getAllTravelSupport: vi.fn(),
  createTravelSupport: vi.fn(),
  updateBankingDetails: vi.fn(),
  submitTravelSupport: vi.fn(),
  updateTravelSupportStatus: vi.fn(),
  addTravelExpense: vi.fn(),
  updateTravelExpense: vi.fn(),
  updateExpenseStatus: vi.fn(),
  deleteTravelExpense: vi.fn(),
  deleteReceipt: vi.fn(),
  getSpeakersRequiringTravelSupport: vi.fn(),
  getTravelExpenseRef: vi.fn(),
  resolveTravelSupportConferenceId: h.resolve,
}))
vi.mock('@/lib/speaker/sanity', () => ({ getSpeaker: vi.fn() }))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(),
  getOrganizerSpeakerIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/teams', () => ({
  resolveRoutedOrganizerIds: vi.fn().mockResolvedValue([]),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { travelSupportRouter } from './travelSupport'

const t = initTRPC.context<Context>().create()

function ctx(): Context {
  const speaker = { _id: 'sp-1', name: 'Speaker' }
  const user = { email: 's@example.com', name: 'Speaker', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const travelSupport = () => t.createCallerFactory(travelSupportRouter)(ctx())

describe('travelSupport conferenceId (B3, #1546)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getConference.mockResolvedValue({
      conference: { _id: 'conf-current', organization: { _ref: 'org-A' } },
      error: null,
    })
    h.resolve.mockResolvedValue(null)
  })

  it('getMine answers NOT_FOUND for a rejected conferenceId', async () => {
    await expect(
      travelSupport().getMine({ conferenceId: 'conf-foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.resolve).toHaveBeenCalledWith(
      'sp-1',
      expect.objectContaining({ _id: 'conf-current' }),
      'conf-foreign',
    )
  })

  it('create answers NOT_FOUND for a rejected conferenceId', async () => {
    await expect(
      travelSupport().create({
        speaker: { _ref: 'sp-1', _type: 'reference' },
        bankingDetails: {
          beneficiaryName: '',
          bankName: '',
          swiftCode: '',
          country: '',
        },
        conferenceId: 'conf-foreign',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.resolve).toHaveBeenCalledWith(
      'sp-1',
      expect.objectContaining({ _id: 'conf-current' }),
      'conf-foreign',
    )
  })
})
