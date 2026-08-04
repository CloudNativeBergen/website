import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { Format } from '@/lib/proposal/types'

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
// Drives clientReadUncached.fetch — updateTeams reads the current organizer ids
// and updateDomains reads the domains claimed by OTHER conferences.
const uncachedFetchMock = vi.fn()
/**
 * Stand-in datastore for the claimed-domains GROQ: every conference document's
 * `domains[]`, keyed by `_id` (drafts included, under their `drafts.` id). The
 * mock APPLIES the query's `$excludeIds` itself rather than returning a canned
 * list, so a router that forgets to self-exclude really does see its OWN
 * domains come back — which is what makes the self-exclusion tests bite.
 */
let domainsByConference: Record<string, string[]> = {}
/**
 * Which ids the reference-injection guards (#731 F4) will accept, or `null` for
 * "everything the caller sends is ours" — the default, so the existing
 * behavioural tests are unaffected.
 */
let referenceableIds: Set<string> | null = null
let lastClaimedParams: Record<string, unknown> | undefined
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
  clientReadUncached: {
    fetch: (...args: unknown[]) => uncachedFetchMock(...args),
  },
}))

// The teams cache clear is a side effect updateTeams performs on success.
const clearTeamsCacheMock = vi.fn()
vi.mock('@/lib/teams', () => ({
  clearConferenceTeamsCache: () => clearTeamsCacheMock(),
}))

import { revalidateTag } from 'next/cache'
import { conferenceRouter } from './conference'
import { DOMAIN_ALREADY_CLAIMED } from '@/lib/conference/domains'

const revalidateTagMock = revalidateTag as unknown as ReturnType<typeof vi.fn>

const CONFERENCE_ID = 'conf-1'
/** The org the domain-resolved conference belongs to; see `ORG_ID` use below. */
const ORG_ID = 'org-test'

/**
 * Org-scoped authz keys on `organizerOrgIds` ALONE (the global `isOrganizer`
 * bridge is gone), so an "organizer" caller must carry the SAME org the
 * request's domain conference resolves to — hence `ORG_ID` on both sides.
 */
function makeCaller(opts: { isOrganizer?: boolean } | null) {
  const speaker = opts
    ? {
        _id: 'sp-1',
        name: 'Org',
        isOrganizer: opts.isOrganizer ?? false,
        organizerOrgIds: opts.isOrganizer ? [ORG_ID] : [],
      }
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
  // This conference already owns the host every test is served on.
  domainsByConference = { [CONFERENCE_ID]: ['cloudnativebergen.no'] }
  lastClaimedParams = undefined
  referenceableIds = null
  // Default organizer set for the teams subset check: the caller (sp-1) + sp-2.
  // The domains claimed-set query is answered from `domainsByConference`, with
  // the query's own `$excludeIds` applied.
  uncachedFetchMock.mockImplementation(
    async (query: string, params?: Record<string, unknown>) => {
      if (query.includes('.domains[]')) {
        lastClaimedParams = params
        const excluded = new Set((params?.excludeIds as string[]) ?? [])
        return Object.entries(domainsByConference)
          .filter(([id]) => !excluded.has(id))
          .flatMap(([, domains]) => domains)
      }
      // REFERENCE-INJECTION guards (#731 F4): `updateOrganizers` and
      // `updateTopics` count how many of the supplied ids this org may
      // reference. By default every id is ours; the refusal tests below flip it.
      if (query.startsWith('count(')) {
        return referenceableIds === null
          ? new Set((params?.ids as string[]) ?? []).size
          : ((params?.ids as string[]) ?? []).filter((id) =>
              referenceableIds!.has(id),
            ).length
      }
      return ['sp-1', 'sp-2']
    },
  )
  // The domain conference carries the org the authz waist gates on, so
  // `resolveOrganizationId()` yields ORG_ID for every request in this file.
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    domain: 'cloudnativebergen.no',
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

describe('conference router — tenant-scoped cache invalidation (#618)', () => {
  it('revalidates only the edited conference by its scoped tag', async () => {
    await makeCaller({ isOrganizer: true }).updateBasicInfo({
      title: 'DevOpsDays',
      organizer: 'CNB',
    })
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
    // The broad tag would bust every other tenant's cached conference read.
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      'content:conferences',
      expect.anything(),
    )
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

describe('conference router — visibility (M0 trial state)', () => {
  it('flips visibility to unlisted, patching ONLY that field', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateVisibility({
      visibility: 'unlisted',
    })
    expect(result.success).toBe(true)
    expect(lastPatchId).toBe(CONFERENCE_ID)
    expect(lastSet).toEqual({ visibility: 'unlisted' })
    expect(lastUnset).toBeUndefined()
  })

  it('flips visibility to live', async () => {
    await makeCaller({ isOrganizer: true }).updateVisibility({
      visibility: 'live',
    })
    expect(lastSet).toEqual({ visibility: 'live' })
  })

  it('revalidates only the edited conference by its scoped tag', async () => {
    await makeCaller({ isOrganizer: true }).updateVisibility({
      visibility: 'unlisted',
    })
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
  })

  it('rejects a non-organizer (FORBIDDEN)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).updateVisibility({
        visibility: 'unlisted',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown visibility value', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateVisibility({
        // @ts-expect-error — exercising the enum guard with a bad value
        visibility: 'private',
      }),
    ).rejects.toBeDefined()
    expect(commitMock).not.toHaveBeenCalled()
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

describe('conference router — domains global uniqueness (#680)', () => {
  const CURRENT = 'cloudnativebergen.no'
  const OTHER_CONFERENCE = 'other-conf'

  it('rejects an exact host another conference already routes via a WILDCARD', async () => {
    domainsByConference[OTHER_CONFERENCE] = ['*.cnb.no']
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [CURRENT, '2026.cnb.no'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: `${DOMAIN_ALREADY_CLAIMED}: 2026.cnb.no`,
    })
    // Fail CLOSED: no patch is opened when the claim is refused.
    expect(commitMock).not.toHaveBeenCalled()
    expect(lastSet).toBeUndefined()
  })

  it('rejects a WILDCARD that would capture the exact host of another conference', async () => {
    domainsByConference[OTHER_CONFERENCE] = ['2025.cnb.no']
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [CURRENT, '*.cnb.no'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: `${DOMAIN_ALREADY_CLAIMED}: *.cnb.no`,
    })
    expect(commitMock).not.toHaveBeenCalled()
    expect(lastSet).toBeUndefined()
  })

  it('rejects an exact host another conference claims exactly', async () => {
    domainsByConference[OTHER_CONFERENCE] = ['2025.cnb.no']
    await expect(
      makeCaller({ isOrganizer: true }).updateDomains({
        domains: [CURRENT, '2025.cnb.no'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  // --- SELF-EXCLUSION: the false-positive guard ----------------------------

  it('SELF-EXCLUSION: re-saving its OWN unchanged domains succeeds', async () => {
    // A wildcard + the hosts it covers, all owned by THIS conference — every
    // pair overlaps, so a claimed set that failed to drop the document under
    // edit would reject this no-op save and brick all domain editing.
    const own = [CURRENT, '*.cnb.no', '2025.cnb.no']
    domainsByConference[CONFERENCE_ID] = own
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: own,
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ domains: own })
  })

  it('SELF-EXCLUSION: excludes BOTH the published and the draft id', async () => {
    const own = [CURRENT, '*.cnb.no']
    domainsByConference[CONFERENCE_ID] = own
    // An unpublished draft carries its own copy of the same list.
    domainsByConference[`drafts.${CONFERENCE_ID}`] = own
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: own,
    })
    expect(result.success).toBe(true)
    expect(lastClaimedParams?.excludeIds).toEqual([
      CONFERENCE_ID,
      `drafts.${CONFERENCE_ID}`,
    ])
  })

  it('SELF-EXCLUSION: reordering its own domains succeeds', async () => {
    const own = [CURRENT, '*.cnb.no', '2025.cnb.no']
    domainsByConference[CONFERENCE_ID] = own
    const reordered = ['2025.cnb.no', CURRENT, '*.cnb.no']
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: reordered,
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ domains: reordered })
  })

  it('SELF-EXCLUSION: removing one of its own domains succeeds', async () => {
    domainsByConference[CONFERENCE_ID] = [CURRENT, '*.cnb.no', '2025.cnb.no']
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: [CURRENT, '*.cnb.no'],
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ domains: [CURRENT, '*.cnb.no'] })
  })

  it('accepts a legitimate, non-overlapping addition', async () => {
    domainsByConference[OTHER_CONFERENCE] = ['*.cnb.no', '2025.cndn.no']
    const result = await makeCaller({ isOrganizer: true }).updateDomains({
      domains: [CURRENT, '2027.example.com'],
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ domains: [CURRENT, '2027.example.com'] })
  })

  it('validateUpdatedDomains mirrors the rule and self-excludes', async () => {
    domainsByConference[CONFERENCE_ID] = [CURRENT, '2025.cnb.no']
    domainsByConference[OTHER_CONFERENCE] = ['*.cndn.no']
    const res = await makeCaller({ isOrganizer: true }).validateUpdatedDomains({
      domains: ['2025.cnb.no', '2026.cndn.no', 'fresh.example.com'],
    })
    // Own entry is NOT reported; the other tenant's wildcard match is.
    expect(res.taken).toEqual(['2026.cndn.no'])
  })
})

// === SE-2: organizers, topics, teams & announcement ========================

describe('conference router — organizers (self-lockout guard)', () => {
  it('rejects removing yourself (BAD_REQUEST with the exact message)', async () => {
    // Caller is sp-1; a payload that omits sp-1 would revoke their own access.
    await expect(
      makeCaller({ isOrganizer: true }).updateOrganizers({
        organizers: ['sp-2', 'sp-3'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You cannot remove yourself from the organizer team',
    })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows removing OTHER organizers while keeping yourself', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateOrganizers({
      organizers: ['sp-1', 'sp-3'],
    })
    expect(result.success).toBe(true)
    const rows = lastSet!.organizers as Array<Record<string, unknown>>
    expect(rows.map((r) => r._ref)).toEqual(['sp-1', 'sp-3'])
    expect(rows.every((r) => r._type === 'reference')).toBe(true)
    expect(rows.every((r) => typeof r._key === 'string')).toBe(true)
  })

  it('rejects an empty organizer list (non-empty ALWAYS)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateOrganizers({ organizers: [] }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate organizer ids', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateOrganizers({
        organizers: ['sp-1', 'sp-1'],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  /**
   * #731 F4. `organizers[]` is what `organizerOrgIds` is derived from, so an
   * unvalidated id here does not merely RENDER a stranger as an organizer — it
   * grants that foreign person admin standing in this org on their next
   * sign-in. The self-lockout check was the only check.
   */
  it('refuses an organizer id this org has no standing over', async () => {
    referenceableIds = new Set(['sp-1'])
    await expect(
      makeCaller({ isOrganizer: true }).updateOrganizers({
        organizers: ['sp-1', 'sp-foreign'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('refuses a non-speaker id (wrong `_type`) in organizers[]', async () => {
    // The guard's count constrains `_type == "speaker"`, so a topic or
    // conference id comes back as not-ours and refuses the whole write.
    referenceableIds = new Set(['sp-1'])
    await expect(
      makeCaller({ isOrganizer: true }).updateOrganizers({
        organizers: ['sp-1', 'conf-other'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — topics', () => {
  it('replaces the topics reference array (keyed references)', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateTopics({
      topics: ['topic-a', 'topic-b'],
    })
    expect(result.success).toBe(true)
    const rows = lastSet!.topics as Array<Record<string, unknown>>
    expect(rows.map((r) => r._ref)).toEqual(['topic-a', 'topic-b'])
    expect(rows.every((r) => r._type === 'reference')).toBe(true)
  })

  it('rejects an empty topic list (min 1)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTopics({ topics: [] }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate topic ids', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTopics({
        topics: ['topic-a', 'topic-a'],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  /** #731 F4: topics are org-owned; another tenant's taxonomy is not ours. */
  it('refuses a topic id belonging to another organization', async () => {
    referenceableIds = new Set(['topic-a'])
    await expect(
      makeCaller({ isOrganizer: true }).updateTopics({
        topics: ['topic-a', 'topic-foreign'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — formats', () => {
  it('replaces the formats array as PLAIN keys (no reference wrapping)', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateFormats({
      formats: [Format.lightning_10, Format.presentation_25],
    })
    expect(result.success).toBe(true)
    // Formats are enum strings, not references — stored verbatim, no _key/_ref.
    expect(lastSet!.formats).toEqual(['lightning_10', 'presentation_25'])
    // Field-scoped to the resolved conference, never a client-sent id.
    expect(lastPatchId).toBe(CONFERENCE_ID)
  })

  it('rejects an empty format list (min 1)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateFormats({ formats: [] }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate format keys', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateFormats({
        formats: [Format.lightning_10, Format.lightning_10],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown format key (enum-constrained)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateFormats({
        // @ts-expect-error — deliberately outside the Format enum
        formats: ['keynote_60'],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a non-organizer (adminProcedure)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).updateFormats({
        formats: [Format.lightning_10],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — teams', () => {
  const validTeam = {
    key: 'cfp',
    title: 'CFP Team',
    members: ['sp-1'],
  }

  it('saves teams, keys members, and clears the teams cache', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateTeams({
      teams: [
        { ...validTeam, slackChannel: '#cfp', emailIdentity: ['cfpEmail'] },
      ],
    })
    expect(result.success).toBe(true)
    const rows = lastSet!.teams as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'cfp',
      title: 'CFP Team',
      slackChannel: '#cfp',
      emailIdentity: ['cfpEmail'],
    })
    const members = rows[0].members as Array<Record<string, unknown>>
    expect(members[0]).toMatchObject({ _type: 'reference', _ref: 'sp-1' })
    expect(typeof rows[0]._key).toBe('string')
    expect(clearTeamsCacheMock).toHaveBeenCalledTimes(1)
  })

  it('enforces the member ⊆ organizers subset (BAD_REQUEST, no commit)', async () => {
    // sp-9 is not in the organizer set (['sp-1','sp-2']).
    await expect(
      makeCaller({ isOrganizer: true }).updateTeams({
        teams: [{ key: 'cfp', title: 'CFP', members: ['sp-9'] }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
    expect(clearTeamsCacheMock).not.toHaveBeenCalled()
  })

  it('rejects a non-kebab key', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTeams({
        teams: [{ key: 'CFP Team', title: 'CFP', members: ['sp-1'] }],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate team keys', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTeams({
        teams: [
          { key: 'cfp', title: 'One', members: ['sp-1'] },
          { key: 'cfp', title: 'Two', members: ['sp-2'] },
        ],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a team with no members', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTeams({
        teams: [{ key: 'cfp', title: 'CFP', members: [] }],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — announcement', () => {
  it('sets the portable-text blocks (with keys) when non-empty', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateAnnouncement({
      announcement: [
        { _type: 'block', children: [{ _type: 'span', text: 'Hi' }] },
      ],
    })
    expect(result.success).toBe(true)
    const blocks = lastSet!.announcement as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ _type: 'block' })
    expect(typeof blocks[0]._key).toBe('string')
  })

  it('UNSETS the field when given an empty array', async () => {
    await makeCaller({ isOrganizer: true }).updateAnnouncement({
      announcement: [],
    })
    expect(lastUnset).toEqual(['announcement'])
    expect(lastSet).toBeUndefined()
  })

  it('UNSETS the field when given null', async () => {
    await makeCaller({ isOrganizer: true }).updateAnnouncement({
      announcement: null,
    })
    expect(lastUnset).toEqual(['announcement'])
  })
})

// === SE-3: branding logos (inlineSvg upload) ===============================

describe('conference router — branding logo', () => {
  const BENIGN = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`

  it('sets a sanitized, benign logo on the requested slot only', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateBrandingLogo({
      slot: 'logoBright',
      svg: BENIGN,
    })
    expect(result.success).toBe(true)
    expect(lastSet).toEqual({ logoBright: BENIGN })
    expect(lastUnset).toBeUndefined()
  })

  it('strips dangerous content server-side before storing', async () => {
    await makeCaller({ isOrganizer: true }).updateBrandingLogo({
      slot: 'logoDark',
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="x()" width="10"/></svg>`,
    })
    const stored = (lastSet as Record<string, string>).logoDark
    expect(stored).not.toMatch(/script/i)
    expect(stored).not.toMatch(/onclick/i)
    expect(stored).toMatch(/<rect/)
  })

  it('UNSETS the slot when svg is null', async () => {
    await makeCaller({ isOrganizer: true }).updateBrandingLogo({
      slot: 'logomarkBright',
      svg: null,
    })
    expect(lastUnset).toEqual(['logomarkBright'])
    expect(lastSet).toBeUndefined()
  })

  it('rejects an unknown slot (schema)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateBrandingLogo({
        // @ts-expect-error — deliberately invalid slot
        slot: 'faviconBright',
        svg: BENIGN,
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a non-svg payload with BAD_REQUEST (no commit)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateBrandingLogo({
        slot: 'logoBright',
        svg: '<html><body>nope</body></html>',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('requires an organizer', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).updateBrandingLogo({
        slot: 'logoBright',
        svg: BENIGN,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('conference router — sanitizeSvgPreview (dry run)', () => {
  it('returns the sanitized markup and what was stripped, without committing', async () => {
    const result = await makeCaller({ isOrganizer: true }).sanitizeSvgPreview({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><script>x</script><rect onload="y()" width="10"/></svg>`,
    })
    expect(result.ok).toBe(true)
    expect(result.svg).not.toMatch(/script|onload/i)
    expect(result.removed).toEqual(
      expect.arrayContaining(['<script> element', 'onload event handler']),
    )
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('reports a rejection (ok:false) rather than throwing', async () => {
    const result = await makeCaller({ isOrganizer: true }).sanitizeSvgPreview({
      svg: 'not an svg',
    })
    expect(result.ok).toBe(false)
    expect(result.svg).toBeNull()
    expect(result.error).toBeTruthy()
  })
})
