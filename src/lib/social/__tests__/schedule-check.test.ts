/**
 * `scheduleIssues` is the ONE function both transitions into `scheduled` go
 * through: `social.scheduleVariant` and a Marketing Task's approval (#1012).
 * These tests run it for real — no mocked validator — so the first-comment
 * rule (spec §3.1, #1134) is proven at schedule AND at approve at once.
 *
 * A LinkedIn variant resolves no adapter (no `CONNECTION_FAMILY` entry), so
 * nothing here reaches a secret store or the network.
 */
import { describe, expect, it, vi } from 'vitest'
import { scheduleIssues } from '../schedule-check'
import { ManualChannelProvider } from '../provider/manual'
import type { SocialPostVariant } from '../types'

// The ADAPTER branch: `scheduleIssues` delegates to `adapter.validate` when
// the organization is connected, and falls back to the shared rules when it
// is not. LinkedIn resolves no adapter today, so the delegating branch needs
// a resolver of its own or it is never executed.
const resolveAdapter = vi.hoisted(() => vi.fn(async () => null))
vi.mock('../provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../provider')>()),
  resolveSocialPublishAdapter: resolveAdapter,
}))

const OURS =
  'https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_medium=social&utm_campaign=earlyBird&utm_content=ticketsOpen%3Alinkedin'

function variant(
  overrides: Partial<SocialPostVariant> = {},
): SocialPostVariant {
  return {
    _id: 'v-1',
    _rev: 'rev-1',
    postId: 'p-1',
    conferenceId: 'conf-A',
    orgId: 'org-A',
    platform: 'linkedin',
    body: 'Tickets are live',
    status: 'draft',
    scheduledAt: '2027-06-01T08:00:00.000Z',
    usesCustomTime: false,
    claimedAt: null,
    shortCode: null,
    submission: null,
    link: OURS,
    attachments: [],
    publishResult: null,
    attempts: [],
    attemptCount: 0,
    ...overrides,
  }
}

const DOMAINS = ['cloudnativebergen.no']

describe('scheduleIssues — the link is the first comment (#1134)', () => {
  it('refuses a LinkedIn body that links to the conference own site', async () => {
    const issues = await scheduleIssues(
      variant({ body: `Tickets are live → ${OURS}` }),
      [],
      { conferenceDomains: DOMAINS },
    )
    expect(issues).toEqual([
      { field: 'body', message: expect.stringContaining('first comment') },
    ])
    expect(issues[0].message).toContain(OURS)
  })

  it('refuses a body tagged for an EARLIER target page, which an exact match on `link` would miss', async () => {
    const stale = 'https://cloudnativebergen.no/cfp?utm_campaign=cfp'
    const issues = await scheduleIssues(
      // `link` is re-derived at approval; the body's URL is frozen at
      // materialize. They differ, and the rule still fires.
      variant({ body: `Submit → ${stale}`, link: OURS }),
      [],
      { conferenceDomains: DOMAINS },
    )
    expect(issues.map((i) => i.field)).toEqual(['body'])
    expect(issues[0].message).toContain(stale)
  })

  it('accepts the copy the built-in Template now writes', async () => {
    expect(
      await scheduleIssues(
        variant({ body: 'Tickets are live — link in the first comment.' }),
        [],
        { conferenceDomains: DOMAINS },
      ),
    ).toEqual([])
  })

  it('leaves a link on someone else host alone', async () => {
    expect(
      await scheduleIssues(
        variant({ body: 'The map: https://landscape.cncf.io' }),
        [],
        { conferenceDomains: DOMAINS },
      ),
    ).toEqual([])
  })

  it('gives the ADAPTER the same context when the organization is connected', async () => {
    const adapter = new ManualChannelProvider('linkedin')
    const validate = vi.spyOn(adapter, 'validate')
    resolveAdapter.mockResolvedValueOnce(
      adapter as unknown as Awaited<ReturnType<typeof resolveAdapter>>,
    )
    const issues = await scheduleIssues(
      variant({ body: `Tickets are live → ${OURS}` }),
      [],
      { conferenceDomains: DOMAINS },
    )
    // A VALUE on both halves: the adapter ran, and it ran WITH the domains.
    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate.mock.calls[0][1]).toEqual({ conferenceDomains: DOMAINS })
    expect(issues).toEqual([
      { field: 'body', message: expect.stringContaining('first comment') },
    ])
  })

  /**
   * The exact copy `expandTemplate` produced for `ticketsOpen:linkedin` under
   * the 2026.1 built-in, on a plan seeded before this release. Spec §3.1: this
   * rule is what CATCHES those already-materialized drafts. There is no
   * migration — rewriting edited copy is not ours to do — so an organizer must
   * edit each before it can be scheduled or approved again.
   */
  it('refuses a LinkedIn draft materialized from the OLD 2026.1 skeleton', async () => {
    const legacy =
      'Tickets for Cloud Native Bergen 2027 are on sale.\n\n' +
      '10 June 2027 at Grieghallen, Bergen: a full day of talks and workshops, lunch included, recordings afterwards. Early-bird pricing runs until the early-bird deadline.\n\n' +
      'Tickets → https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_medium=social&utm_campaign=earlyBird&utm_content=ticketsOpen%3Alinkedin\n\n' +
      '#CloudNativeBergen2027'
    const issues = await scheduleIssues(variant({ body: legacy }), [], {
      conferenceDomains: DOMAINS,
    })
    expect(issues.map((i) => i.field)).toEqual(['body'])
    expect(issues[0].message).toContain('first comment')
  })

  it('says nothing about the same body on Bluesky, where the link is a card', async () => {
    expect(
      await scheduleIssues(
        variant({ platform: 'bluesky', body: `Tickets → ${OURS}` }),
        [],
        { conferenceDomains: DOMAINS },
      ),
    ).toEqual([])
  })
})
