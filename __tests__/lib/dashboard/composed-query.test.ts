/**
 * The composed dashboard query: authorization, tenant scoping, and the promise
 * that composing does not turn into "read everything".
 *
 * The shaping of rows into widget payloads is pinned by
 * `__tests__/lib/dashboard/actions.test.ts`; this file is about the query and
 * the gate in front of it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'

const session: { speaker: Record<string, unknown> | null } = { speaker: null }
const conferenceDoc = {
  _id: 'conf-from-domain',
  title: 'Test Conference',
  domains: ['test.example.com'],
  organization: { _ref: 'org-test' },
  teams: [],
  startDate: '2099-06-01',
  cfpStartDate: '2099-01-01',
  cfpEndDate: '2099-03-01',
}

vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => session,
  AppEnvironment: {},
}))

vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-test',
  getOrganizationById: async () => null,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { ...conferenceDoc },
    domain: 'test.example.com',
    error: null,
    status: 'resolved',
  }),
}))

vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: async () => ({ speakers: [], err: null }),
}))

import { clientReadUncached } from '@/lib/sanity/client'
import { fetchDashboardData } from '@/app/(admin)/admin/actions'
import {
  buildDashboardQuery,
  dashboardQueryParams,
  type DashboardGroqSource,
} from '@/lib/dashboard/aggregate'
import {
  DASHBOARD_WIDGET_KEYS,
  sourcesForWidgets,
} from '@/lib/dashboard/widget-data'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widget-registry'

const readFetch = clientReadUncached.fetch as Mock

const ORGANIZER = {
  _id: 'speaker-1',
  isOrganizer: true,
  organizerOrgIds: ['org-test'],
}

beforeEach(() => {
  readFetch.mockReset()
  readFetch.mockResolvedValue({})
  session.speaker = { ...ORGANIZER }
})

describe('widget registry parity', () => {
  it('every registry widget has a data key, and vice versa', () => {
    expect([...DASHBOARD_WIDGET_KEYS].sort()).toEqual(
      Object.keys(WIDGET_REGISTRY).sort(),
    )
  })
})

describe('authorization', () => {
  it('refuses a non-organizer, and never issues the query', async () => {
    // A real session for a real speaker who simply is not an organizer of this
    // org — not a missing session, which any number of things could refuse.
    session.speaker = {
      _id: 'speaker-1',
      isOrganizer: false,
      organizerOrgIds: [],
    }

    await expect(fetchDashboardData(['cfp-health'])).rejects.toThrow(
      'Unauthorized: organizer access required',
    )
    // GUARD BEFORE FETCH: refusing after reading would leak an existence
    // oracle and would still cost the quota this change exists to protect.
    expect(readFetch).not.toHaveBeenCalled()
  })

  it('refuses an organizer of a DIFFERENT org', async () => {
    session.speaker = {
      _id: 'speaker-1',
      isOrganizer: true,
      organizerOrgIds: ['some-other-org'],
    }

    await expect(fetchDashboardData(['cfp-health'])).rejects.toThrow(
      'Unauthorized: organizer access required',
    )
    expect(readFetch).not.toHaveBeenCalled()
  })

  it('serves the SAME request for an organizer of this org', async () => {
    // The positive control: without it, the two refusals above would pass even
    // if the action refused everyone for an unrelated reason.
    const batch = await fetchDashboardData(['cfp-health'])
    expect(batch['cfp-health']?.ok).toBe(true)
    expect(readFetch).toHaveBeenCalledTimes(1)
  })

  it('serves four widgets from one authorized read, not four', async () => {
    const batch = await fetchDashboardData([
      'cfp-health',
      'proposal-pipeline',
      'review-progress',
      'quick-actions',
    ])
    for (const key of [
      'cfp-health',
      'proposal-pipeline',
      'review-progress',
      'quick-actions',
    ] as const) {
      expect(batch[key]?.ok).toBe(true)
    }
    // Four widgets, one query.
    expect(readFetch).toHaveBeenCalledTimes(1)
  })
})

describe('tenant scoping', () => {
  it('passes the domain-resolved conference as a GROQ PARAMETER', async () => {
    await fetchDashboardData(['cfp-health', 'sponsor-pipeline'])

    const [query, params] = readFetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(params.conferenceId).toBe('conf-from-domain')
    // Not interpolated: the id must not appear in the query TEXT, or the text
    // under review would not be the text that runs.
    expect(query).not.toContain('conf-from-domain')
    expect(query).toContain('$conferenceId')
  })

  it('ignores any conference the caller tries to smuggle in', async () => {
    // `fetchDashboardData` takes widget keys and nothing else — there is no
    // parameter a client could use to name a tenant. Keys that look like ids
    // are simply dropped by the registry check.
    const batch = await fetchDashboardData(['cfp-health', 'conf-other-tenant'])

    expect(Object.keys(batch)).toEqual(['cfp-health'])
    const [, params] = readFetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(params.conferenceId).toBe('conf-from-domain')
  })

  it('gives EVERY root in the composed query a tenant predicate', () => {
    const all: DashboardGroqSource[] = [
      'proposals',
      'reviews',
      'sponsors',
      'activities',
      'recentProposals',
      'travelSupports',
      'featuredSpeakerCount',
      'unassignedSponsorCount',
      'pendingVolunteerCount',
    ]
    const query = buildDashboardQuery(all)!

    // Every `*[` in the query — including the nested expense root — opens a
    // filter that mentions the tenant parameter before it closes.
    const roots = query.split('*[').slice(1)
    expect(roots.length).toBeGreaterThan(all.length) // nested roots included
    for (const root of roots) {
      const filter = root.slice(0, root.indexOf(']'))
      expect(filter, `unscoped root: *[${filter}]`).toContain('$conferenceId')
    }
  })

  it('binds the status literals as parameters, not interpolations', () => {
    const query = buildDashboardQuery(['proposals', 'pendingVolunteerCount'])!
    expect(query).toContain('$draftStatus')
    expect(query).toContain('$pendingVolunteerStatus')

    const params = dashboardQueryParams('conf-1')
    expect(params).toMatchObject({
      conferenceId: 'conf-1',
      draftStatus: 'draft',
      pendingVolunteerStatus: 'pending',
    })
  })
})

describe('composition emits only what the dashboard shows', () => {
  it('maps each widget to its own roots and nothing else', () => {
    const none = new Set<string>()
    expect([...sourcesForWidgets(['cfp-health'], none)]).toEqual(['proposals'])
    expect([...sourcesForWidgets(['proposal-pipeline'], none)]).toEqual([
      'proposals',
    ])
    expect([...sourcesForWidgets(['travel-support'], none)]).toEqual([
      'travelSupports',
    ])
    // Widgets with no Sanity source of their own.
    expect([...sourcesForWidgets(['upcoming-deadlines'], none)]).toEqual([])
    expect([...sourcesForWidgets(['ticket-sales'], none)]).toEqual([])
    expect([...sourcesForWidgets(['workshop-capacity'], none)]).toEqual([])
  })

  it('unions overlapping widgets instead of duplicating a root', () => {
    const sources = sourcesForWidgets(
      ['cfp-health', 'proposal-pipeline', 'quick-actions', 'schedule-builder'],
      new Set(),
    )
    // Four widgets that each used to pull the WHOLE proposal corpus now share
    // one root.
    expect([...sources].filter((s) => s === 'proposals')).toHaveLength(1)
    expect(sources.has('sponsors')).toBe(true)
  })

  it('gates the My-areas count roots on the viewer actually being on the team', () => {
    expect([...sourcesForWidgets(['my-areas'], new Set())]).toEqual([])
    expect([...sourcesForWidgets(['my-areas'], new Set(['cfp']))]).toEqual([])
    expect([...sourcesForWidgets(['my-areas'], new Set(['sponsors']))]).toEqual(
      ['unassignedSponsorCount'],
    )
    expect([
      ...sourcesForWidgets(['my-areas'], new Set(['sponsors', 'volunteers'])),
    ]).toEqual(['unassignedSponsorCount', 'pendingVolunteerCount'])
  })

  it('emits no query at all when nothing needs one', () => {
    expect(buildDashboardQuery([])).toBeNull()
  })
})

describe('failure isolation', () => {
  it('fails only the widgets that read through the composed query', async () => {
    readFetch.mockRejectedValue(new Error('sanity is down'))

    const batch = await fetchDashboardData([
      'cfp-health',
      'speaker-engagement',
      'upcoming-deadlines',
    ])

    // Both of these have a root in the composed query, so both must show an
    // error rather than a plausible zero.
    expect(batch['cfp-health']).toEqual({ ok: false, error: 'sanity is down' })
    expect(batch['speaker-engagement']).toEqual({
      ok: false,
      error: 'sanity is down',
    })
    // Deadlines are computed from the conference document alone — the failed
    // read is none of their business, and they still render.
    expect(batch['upcoming-deadlines']?.ok).toBe(true)
  })
})
