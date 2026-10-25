/**
 * @vitest-environment node
 *
 * `speaker.setDinnerChoice` and `conference.dinnerChoiceSummary` (#1592,
 * phase 5): who may choose, which choices are accepted, and tenant scoping.
 */

const h = vi.hoisted(() => ({
  getDinnerChoiceContext: vi.fn(),
  setDinnerChoice: vi.fn(),
  getDinnerChoiceSummaryInputs: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'a.test',
    error: null,
    status: 'resolved',
  }),
}))

vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-A',
}))

vi.mock('@/lib/speaker/dinnerChoice-sanity', () => h)

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'
import { conferenceRouter } from './conference'

function ctxFor(speaker: Record<string, unknown>) {
  return {
    session: {
      user: { id: speaker._id, email: 'x@example.test' },
      speaker,
      expires: '2099-01-01T00:00:00.000Z',
    },
    speaker,
  } as unknown as Context
}

const speakerCaller = () =>
  speakerRouter.createCaller(ctxFor({ _id: 'sp-1', name: 'Ada' }))

const organizerCaller = (orgId: string) =>
  conferenceRouter.createCaller(
    ctxFor({
      _id: 'org-1',
      name: 'Org',
      isOrganizer: true,
      organizerOrgIds: [orgId],
    }),
  )

const routes = [
  { _key: 'taxi', label: 'Taxi from the venue' },
  { _key: 'hike', label: 'Hike' },
]

beforeEach(() => {
  vi.clearAllMocks()
  h.getDinnerChoiceContext.mockResolvedValue({ routes, hasConfirmedTalk: true })
})

describe('speaker.setDinnerChoice', () => {
  it('saves a current route for the caller on the domain conference', async () => {
    await expect(
      speakerCaller().setDinnerChoice({ choice: 'hike' }),
    ).resolves.toEqual({ choice: 'hike' })
    expect(h.getDinnerChoiceContext).toHaveBeenCalledWith('conf-A', 'sp-1')
    expect(h.setDinnerChoice).toHaveBeenCalledWith('conf-A', 'sp-1', 'hike')
  })

  it('accepts own and not-coming', async () => {
    await speakerCaller().setDinnerChoice({ choice: 'own' })
    await speakerCaller().setDinnerChoice({ choice: 'not-coming' })
    expect(h.setDinnerChoice).toHaveBeenCalledTimes(2)
  })

  it('refuses a speaker without a confirmed talk in this conference', async () => {
    // Also the cross-tenant case: a confirmed talk elsewhere does not count,
    // because the check runs against the domain's conference only.
    h.getDinnerChoiceContext.mockResolvedValue({
      routes,
      hasConfirmedTalk: false,
    })
    await expect(
      speakerCaller().setDinnerChoice({ choice: 'taxi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.setDinnerChoice).not.toHaveBeenCalled()
  })

  it('refuses a route key the conference does not offer', async () => {
    await expect(
      speakerCaller().setDinnerChoice({ choice: 'boat' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.setDinnerChoice).not.toHaveBeenCalled()
  })

  it('refuses an organizer impersonating the speaker', async () => {
    const ctx = ctxFor({ _id: 'sp-1', name: 'Ada' })
    ;(ctx.session as { isImpersonating?: boolean }).isImpersonating = true
    await expect(
      speakerRouter.createCaller(ctx).setDinnerChoice({ choice: 'own' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.getDinnerChoiceContext).not.toHaveBeenCalled()
    expect(h.setDinnerChoice).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    const caller = speakerRouter.createCaller({} as unknown as Context)
    await expect(
      caller.setDinnerChoice({ choice: 'own' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('conference.dinnerChoiceSummary', () => {
  it('counts the domain conference', async () => {
    h.getDinnerChoiceSummaryInputs.mockResolvedValue({
      routes,
      speakers: [
        { _id: 'a', name: 'Ada' },
        { _id: 'b', name: 'Bo' },
      ],
      choices: [{ speakerId: 'a', choice: 'taxi' }],
    })
    const rows = await organizerCaller('org-A').dinnerChoiceSummary()
    expect(h.getDinnerChoiceSummaryInputs).toHaveBeenCalledWith('conf-A')
    expect(rows.map((r) => [r.value, r.speakers.map((s) => s.name)])).toEqual([
      ['taxi', ['Ada']],
      ['hike', []],
      ['own', []],
      ['not-coming', []],
      ['~removed-route', []],
      [null, ['Bo']],
    ])
  })

  it('refuses an organizer of another organization', async () => {
    await expect(
      organizerCaller('org-B').dinnerChoiceSummary(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.getDinnerChoiceSummaryInputs).not.toHaveBeenCalled()
  })
})
