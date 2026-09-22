/**
 * `scheduleIssues` is the ONE function both transitions into `scheduled` go
 * through: `social.scheduleVariant` and a Marketing Task's approval (#1012).
 * These tests run it for real — no mocked validator — so the first-comment
 * rule (spec §3.1, #1134) is proven at schedule AND at approve at once.
 *
 * A LinkedIn variant resolves no adapter (no `CONNECTION_FAMILY` entry), so
 * nothing here reaches a secret store or the network.
 */
import { describe, expect, it } from 'vitest'
import { scheduleIssues } from '../schedule-check'
import type { SocialPostVariant } from '../types'

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
