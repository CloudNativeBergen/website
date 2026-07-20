import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/cache -------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- next/headers: drives the domains current-host guard --------------------
const hostMock = vi.fn<() => string | null>(() => 'cloudnativebergen.no')
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? hostMock() : null),
  }),
}))

// --- Conference resolution (drives resolveConferenceId) ---------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// --- Sanity write client: capture the patch shape ---------------------------
const commitMock = vi.fn()
let lastPatchId: string | undefined
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined
let lastSetIfMissing: Record<string, unknown> | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        setIfMissing: (obj: Record<string, unknown>) => {
          lastSetIfMissing = obj
          return builder
        },
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
}))

import { conferenceRouter } from './conference'

const CONFERENCE_ID = 'conf-1'

function makeCaller(opts: { isOrganizer?: boolean } | null) {
  const speaker = opts
    ? { _id: 'sp-1', name: 'Org', isOrganizer: opts.isOrganizer ?? false }
    : undefined
  const ctx = {
    session: speaker ? { speaker, user: { name: 'Org' } } : null,
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSet = undefined
  lastUnset = undefined
  lastSetIfMissing = undefined
  hostMock.mockReturnValue('cloudnativebergen.no')
  commitMock.mockResolvedValue({ _id: CONFERENCE_ID })
  getConferenceMock.mockResolvedValue({
    conference: { _id: CONFERENCE_ID },
    error: null,
  })
})

describe('conference router — authorization', () => {
  it('rejects a non-organizer speaker (FORBIDDEN)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).updateBasicInfo({
        title: 'DevOpsDays',
        organizer: 'CNB',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller (UNAUTHORIZED)', async () => {
    await expect(
      makeCaller(null).updateBasicInfo({ title: 'X', organizer: 'Y' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows an organizer', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateBasicInfo({
      title: 'DevOpsDays',
      organizer: 'CNB',
    })
    expect(result.success).toBe(true)
    expect(lastPatchId).toBe(CONFERENCE_ID)
  })
})

describe('conference router — field-scoped patch shape', () => {
  it('only sets the fieldset keys that were provided (⊆ provided)', async () => {
    await makeCaller({ isOrganizer: true }).updateBasicInfo({
      title: 'DevOpsDays',
      organizer: 'CNB',
      city: 'Bergen',
      country: 'Norway',
    })
    const provided = ['title', 'organizer', 'city', 'country']
    expect(lastSet).toBeDefined()
    for (const key of Object.keys(lastSet!)) {
      expect(provided).toContain(key)
    }
    // Never touches fields outside the fieldset.
    expect(lastSet).not.toHaveProperty('venueName')
    expect(lastSet).not.toHaveProperty('cfpEmail')
  })

  it('never derives the conference id from client input', async () => {
    await makeCaller({ isOrganizer: true }).updateVenue({
      venueName: 'Grieghallen',
    })
    // The id is the one resolveConferenceId returned, not anything client-sent.
    expect(lastPatchId).toBe(CONFERENCE_ID)
    expect(getConferenceMock).toHaveBeenCalled()
  })
})

describe('conference router — unset semantics', () => {
  it('routes explicit null to .unset() and omits it from .set()', async () => {
    await makeCaller({ isOrganizer: true }).updateTicketingIds({
      checkinCustomerId: 42,
      checkinEventId: null,
    })
    expect(lastSet).toEqual({ checkinCustomerId: 42 })
    expect(lastUnset).toEqual(['checkinEventId'])
  })

  it('leaves omitted optional fields untouched (neither set nor unset)', async () => {
    await makeCaller({ isOrganizer: true }).updateCfpGoals({
      cfpSubmissionGoal: 100,
    })
    expect(lastSet).toEqual({ cfpSubmissionGoal: 100 })
    expect(lastUnset).toBeUndefined()
  })

  it('rejects an empty input with BAD_REQUEST (nothing to set or unset)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCfpGoals({}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — validation', () => {
  it('rejects a blank required title', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateBasicInfo({
        title: '   ',
        organizer: 'CNB',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid contact email', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCommunication({
        contactEmail: 'not-an-email',
        cfpEmail: 'cfp@example.com',
        sponsorEmail: 'sponsor@example.com',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid registration URL', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateRegistration({
        registrationEnabled: true,
        registrationLink: 'notaurl',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects end date before start date', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDates({
        startDate: '2026-10-10',
        endDate: '2026-10-09',
        cfpStartDate: '2026-01-01',
        cfpEndDate: '2026-05-01',
        cfpNotifyDate: '2026-06-01',
        programDate: '2026-07-01',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects cfp end date before cfp start date', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDates({
        startDate: '2026-10-10',
        endDate: '2026-10-11',
        cfpStartDate: '2026-05-01',
        cfpEndDate: '2026-01-01',
        cfpNotifyDate: '2026-06-01',
        programDate: '2026-07-01',
      }),
    ).rejects.toBeTruthy()
  })

  it('accepts a valid, correctly-ordered dates payload', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateDates({
      startDate: '2026-10-10',
      endDate: '2026-10-11',
      cfpStartDate: '2026-01-01',
      cfpEndDate: '2026-05-01',
      cfpNotifyDate: '2026-06-01',
      programDate: '2026-07-01',
    })
    expect(result.success).toBe(true)
    expect(lastSet).toMatchObject({ startDate: '2026-10-10' })
  })

  it('rejects a negative goal', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCfpGoals({
        cfpSubmissionGoal: -5,
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a non-integer checkin id', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTicketingIds({
        checkinCustomerId: 3.5,
      }),
    ).rejects.toBeTruthy()
  })

  it('rejects a non-positive checkin id', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTicketingIds({
        checkinEventId: 0,
      }),
    ).rejects.toBeTruthy()
  })
})

// === SE-1b: array & object fieldsets =======================================

describe('conference router — social links', () => {
  it('replaces the whole array (empty allowed)', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateSocialLinks({
      socialLinks: [],
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ socialLinks: [] })
  })

  it('rejects an invalid URL row', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateSocialLinks({
        socialLinks: ['https://ok.example', 'not-a-url'],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('sets only the socialLinks key (field-scoped)', async () => {
    await makeCaller({ isOrganizer: true }).updateSocialLinks({
      socialLinks: ['https://bsky.app/profile/x'],
    })
    expect(Object.keys(lastSet!)).toEqual(['socialLinks'])
  })
})

describe('conference router — features', () => {
  it('accepts a mix of known and custom flags', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateFeatures({
      features: ['test_feature', 'custom_flag'],
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ features: ['test_feature', 'custom_flag'] })
  })

  it('rejects duplicate flags', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateFeatures({
        features: ['a', 'a'],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — vanity metrics', () => {
  it('adds a _key to every row', async () => {
    await makeCaller({ isOrganizer: true }).updateVanityMetrics({
      vanityMetrics: [{ label: 'Attendees', value: '400' }],
    })
    const rows = lastSet!.vanityMetrics as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Attendees', value: '400' })
    expect(typeof rows[0]._key).toBe('string')
  })

  it('preserves an existing _key', async () => {
    await makeCaller({ isOrganizer: true }).updateVanityMetrics({
      vanityMetrics: [{ label: 'Talks', value: '30', _key: 'existing-1' }],
    })
    const rows = lastSet!.vanityMetrics as Array<Record<string, unknown>>
    expect(rows[0]._key).toBe('existing-1')
  })

  it('rejects a row with a blank required column', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateVanityMetrics({
        vanityMetrics: [{ label: 'x', value: '   ' }],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — sponsor benefits', () => {
  it('accepts a valid icon and keys the row', async () => {
    await makeCaller({ isOrganizer: true }).updateSponsorBenefits({
      sponsorBenefits: [
        {
          title: 'Reach',
          description: 'Great reach',
          icon: 'RocketLaunchIcon',
        },
      ],
    })
    const rows = lastSet!.sponsorBenefits as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({
      title: 'Reach',
      description: 'Great reach',
      icon: 'RocketLaunchIcon',
    })
    expect(typeof rows[0]._key).toBe('string')
  })

  it('rejects an unknown icon value', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateSponsorBenefits({
        sponsorBenefits: [
          { title: 'x', description: 'y', icon: 'NotARealIcon' },
        ],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows an omitted icon', async () => {
    const result = await makeCaller({
      isOrganizer: true,
    }).updateSponsorBenefits({
      sponsorBenefits: [{ title: 'x', description: 'y' }],
    })
    expect(result.success).toBe(true)
    const rows = lastSet!.sponsorBenefits as Array<Record<string, unknown>>
    expect(rows[0]).not.toHaveProperty('icon')
  })
})

describe('conference router — sponsorship customization (object)', () => {
  it('patches field-scoped dot paths under a setIfMissing parent', async () => {
    await makeCaller({ isOrganizer: true }).updateSponsorshipCustomization({
      heroHeadline: 'New headline',
      philosophyTitle: null,
    })
    expect(lastSetIfMissing).toEqual({ sponsorshipCustomization: {} })
    expect(lastSet).toEqual({
      'sponsorshipCustomization.heroHeadline': 'New headline',
    })
    expect(lastUnset).toEqual(['sponsorshipCustomization.philosophyTitle'])
  })

  it('rejects an invalid prospectus URL', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateSponsorshipCustomization({
        prospectusUrl: 'notaurl',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — domains (safeguarded)', () => {
  const CURRENT = 'cloudnativebergen.no'
  const other = 'cloudnativeday.no'

  it('happy path: keeps the current domain', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: [CURRENT, other],
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ domains: [CURRENT, other] })
  })

  it('rejects an empty list (BAD_REQUEST)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({ domains: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a duplicate entry', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [CURRENT, CURRENT],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a scheme-carrying entry', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [`https://${CURRENT}`],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a path-carrying entry', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [`${CURRENT}/admin`],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('refuses to remove the current domain (BAD_REQUEST with the exact message)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({ domains: [other] }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You cannot remove the domain you are currently using',
    })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows removal when a wildcard entry still serves the current host', async () => {
    hostMock.mockReturnValue('cfp.example.com')
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: ['*.example.com'],
    })
    expect(result.success).toBe(true)
  })

  it('normalizes entries to lowercase before storing', async () => {
    hostMock.mockReturnValue(CURRENT)
    await makeCaller({ isOrganizer: true }).updateDomains({
      domains: [`${CURRENT.toUpperCase()}`, 'Other.Example.COM'],
    })
    expect(lastSet).toEqual({ domains: [CURRENT, 'other.example.com'] })
  })
})
