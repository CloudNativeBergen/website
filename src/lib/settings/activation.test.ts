import { describe, it, expect } from 'vitest'
import {
  ACTIVATION_CHECKLIST_HREF,
  buildActivationChecklist,
  currentActivationStage,
  hasCustomDomain,
  hasTicketingBinding,
  isUntouchedStarterFormatSet,
  nextActivationSteps,
  type ConferenceForActivation,
} from './activation'
import { STARTER_SESSION_FORMATS } from '@/lib/onboarding/create'
import { buildProvisionedConference } from '../../../__tests__/testdata/onboarding'
import type { SystemCheck } from '@/lib/system-status/types'

/** A tenant EXACTLY as provisioning creates it (see the fixture's own note). */
function provisioned(): ConferenceForActivation {
  return buildProvisionedConference() as ConferenceForActivation
}

/** A fully configured, live conference — every required row should be done. */
const FULLY_LIVE: ConferenceForActivation = {
  organizers: [{ _ref: 'organizer-1' }, { _ref: 'organizer-2' }],
  title: 'Cloud Native Day',
  organizer: 'Cloud Native Bergen',
  logoBright: 'https://cdn/logo-bright.svg',
  venueName: 'Grieghallen',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  formats: ['lightning_10', 'presentation_25'],
  topics: [{ _id: 't1', title: 'Kubernetes' }],
  contactEmail: 'hi@example.com',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  registrationLink: 'https://tickets.example.com',
  ticketingProvider: 'checkin',
  checkinCustomerId: 123,
  checkinEventId: 456,
  visibility: 'live',
  domains: ['example.com', 'foo.cloudnativebergen.dev'],
}

/** The two system checks the checklist reads, both satisfied. */
const CHECKS_OK: SystemCheck[] = [
  {
    id: 'email.resendKey',
    group: 'email',
    label: 'RESEND_API_KEY',
    status: 'ok',
  },
  {
    id: 'slack.botToken',
    group: 'slack',
    label: 'SLACK_BOT_TOKEN',
    status: 'ok',
  },
]

function rowById(
  checklist: ReturnType<typeof buildActivationChecklist>,
  id: string,
) {
  const row = checklist.rows.find((r) => r.id === id)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

describe('buildActivationChecklist', () => {
  it('a fresh conference has only Go-live done and does not collapse', () => {
    const checklist = buildActivationChecklist({}, [])
    // Absent visibility resolves to live, so "Go live" is the one already-done
    // required row on an otherwise-empty document.
    expect(checklist.done).toBe(1)
    expect(checklist.allDone).toBe(false)
    for (const row of checklist.rows) {
      if (row.id === 'visibility') expect(row.done).toBe(true)
      else expect(row.done).toBe(false)
    }
  })

  it('a fully configured live conference is all done and collapses', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    expect(checklist.done).toBe(checklist.required)
    expect(checklist.allDone).toBe(true)
    for (const row of checklist.rows) expect(row.done).toBe(true)
  })

  it('progress counts only required rows (optional rows excluded)', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    const optional = checklist.rows.filter((r) => r.optional)
    expect(optional.map((r) => r.id).sort()).toEqual([
      'co-organizers',
      'custom-domain',
      'slack',
    ])
    expect(checklist.required).toBe(checklist.rows.length - optional.length)
  })

  it('a partially configured conference reports partial progress', () => {
    const partial: ConferenceForActivation = {
      title: 'Half Set Up',
      organizer: 'Someone',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      // no CFP window, no emails, no logo, no venue, no topics, no ticketing
      visibility: 'unlisted',
    }
    const checklist = buildActivationChecklist(partial, [])
    expect(rowById(checklist, 'basics').done).toBe(true)
    expect(rowById(checklist, 'dates').done).toBe(true)
    expect(rowById(checklist, 'cfp-window').done).toBe(false)
    expect(rowById(checklist, 'emails').done).toBe(false)
    expect(rowById(checklist, 'visibility').done).toBe(false)
    expect(checklist.allDone).toBe(false)
    expect(checklist.done).toBeGreaterThan(0)
    expect(checklist.done).toBeLessThan(checklist.required)
  })

  describe('the formats row', () => {
    // A proposal cannot be submitted without a format (`validateProposalForm`),
    // so an empty list is a launch blocker, not a nicety. Provisioning now
    // seeds the starter set, so this row starts SATISFIED — the note is what
    // keeps that tick from claiming the organizer picked them.
    it('is outstanding for a conference with no formats at all', () => {
      const checklist = buildActivationChecklist({ title: 'Brand New' }, [])
      const row = rowById(checklist, 'formats')
      expect(row.done).toBe(false)
      expect(row.optional).toBeUndefined()
      expect(row.note).toBeUndefined()
    })

    it('is outstanding for an explicitly empty formats array', () => {
      expect(
        rowById(buildActivationChecklist({ formats: [] }, []), 'formats').done,
      ).toBe(false)
    })

    it('is done once a single format is configured', () => {
      expect(
        rowById(
          buildActivationChecklist({ formats: ['lightning_10'] }, []),
          'formats',
        ).done,
      ).toBe(true)
    })

    it('is already done for a freshly provisioned conference', () => {
      // The CFP genuinely can accept proposals on day one, so reporting this as
      // outstanding would be a false launch blocker.
      const row = rowById(
        buildActivationChecklist({ formats: [...STARTER_SESSION_FORMATS] }, []),
        'formats',
      )
      expect(row.done).toBe(true)
    })

    it('says whose choice the starter formats were, and names them', () => {
      const row = rowById(
        buildActivationChecklist({ formats: [...STARTER_SESSION_FORMATS] }, []),
        'formats',
      )
      expect(row.note).toContain('We started you off with')
      expect(row.note).toContain('edit them')
      // The human titles, not raw ids — the same map the editor renders.
      expect(row.note).toContain('Lightning Talk (10 min)')
      expect(row.note).toContain('Presentation (25 min)')
      expect(row.note).toContain('Presentation (45 min)')
      expect(row.note).not.toContain('lightning_10')
    })

    it('drops the note as soon as the organizer changes the list', () => {
      // Derived from the list itself — nothing stores "these are defaults", so
      // any edit (add, remove, replace) retires the advisory.
      const noted = (formats: string[]) =>
        rowById(buildActivationChecklist({ formats }, []), 'formats').note

      expect(
        noted([...STARTER_SESSION_FORMATS, 'workshop_120']),
      ).toBeUndefined()
      expect(noted(['lightning_10', 'presentation_25'])).toBeUndefined()
      expect(noted(['presentation_20', 'presentation_40'])).toBeUndefined()
      // Order is not a change.
      expect(noted([...STARTER_SESSION_FORMATS].reverse())).toBeDefined()
    })

    it('a fully configured conference carries no starter note', () => {
      expect(
        rowById(buildActivationChecklist(FULLY_LIVE, CHECKS_OK), 'formats')
          .note,
      ).toBeUndefined()
    })

    it('counts toward required progress and links to the editor', () => {
      const row = rowById(buildActivationChecklist({}, []), 'formats')
      expect(row.anchor).toBe('#team-content')
      const required = buildActivationChecklist({}, []).rows.filter(
        (r) => !r.optional,
      )
      expect(required.map((r) => r.id)).toContain('formats')
    })
  })

  describe('isUntouchedStarterFormatSet', () => {
    it('recognises the seeded set regardless of order', () => {
      expect(
        isUntouchedStarterFormatSet([
          'presentation_45',
          'lightning_10',
          'presentation_25',
        ]),
      ).toBe(true)
    })

    it('rejects supersets, subsets, empties and absent lists', () => {
      expect(
        isUntouchedStarterFormatSet([
          ...STARTER_SESSION_FORMATS,
          'workshop_240',
        ]),
      ).toBe(false)
      expect(isUntouchedStarterFormatSet(['lightning_10'])).toBe(false)
      expect(isUntouchedStarterFormatSet([])).toBe(false)
      expect(isUntouchedStarterFormatSet(undefined)).toBe(false)
    })

    it('is not fooled by a duplicate padding the length', () => {
      expect(
        isUntouchedStarterFormatSet([
          'lightning_10',
          'lightning_10',
          'presentation_25',
        ]),
      ).toBe(false)
    })

    it('rejects the starter set with a member repeated', () => {
      // A four-entry list is something the organizer edited, whatever its
      // deduplicated contents. Set membership alone would wave this through.
      expect(
        isUntouchedStarterFormatSet([
          ...STARTER_SESSION_FORMATS,
          'lightning_10',
        ]),
      ).toBe(false)
    })
  })

  it('the emails row needs all three addresses', () => {
    const twoOfThree = buildActivationChecklist(
      { contactEmail: 'a@b.c', cfpEmail: 'c@b.c' },
      [],
    )
    expect(rowById(twoOfThree, 'emails').done).toBe(false)
    const allThree = buildActivationChecklist(
      { contactEmail: 'a@b.c', cfpEmail: 'c@b.c', sponsorEmail: 's@b.c' },
      [],
    )
    expect(rowById(allThree, 'emails').done).toBe(true)
  })

  it('treats blank/whitespace strings as unset', () => {
    const checklist = buildActivationChecklist(
      { title: '   ', organizer: '', venueName: '\t' },
      [],
    )
    expect(rowById(checklist, 'basics').done).toBe(false)
    expect(rowById(checklist, 'venue').done).toBe(false)
  })

  it('accepts any of the four logo fields for the brand-logo row', () => {
    expect(
      rowById(
        buildActivationChecklist({ logomarkDark: 'https://x/mark.svg' }, []),
        'branding-logo',
      ).done,
    ).toBe(true)
  })

  describe('the terminal Go-live row', () => {
    it('is done only for an explicitly live (or absent) visibility', () => {
      expect(
        rowById(
          buildActivationChecklist({ visibility: 'live' }, []),
          'visibility',
        ).done,
      ).toBe(true)
      // Absent ⇒ live (legacy documents carry no field).
      expect(rowById(buildActivationChecklist({}, []), 'visibility').done).toBe(
        true,
      )
      expect(
        rowById(
          buildActivationChecklist({ visibility: 'unlisted' }, []),
          'visibility',
        ).done,
      ).toBe(false)
    })

    it('is always the last row', () => {
      const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
      expect(checklist.rows.at(-1)?.id).toBe('visibility')
    })
  })

  describe('provider-aware ticketing row', () => {
    it('checkin (default) needs both customer and event id', () => {
      expect(
        rowById(
          buildActivationChecklist({ checkinCustomerId: 1 }, []),
          'ticketing',
        ).done,
      ).toBe(false)
      const row = rowById(
        buildActivationChecklist(
          { checkinCustomerId: 1, checkinEventId: 2 },
          [],
        ),
        'ticketing',
      )
      expect(row.done).toBe(true)
      expect(row.hint).toMatch(/checkin/i)
    })

    it('tito needs both slugs and ignores checkin ids', () => {
      // Checkin ids present but provider is tito ⇒ not done.
      expect(
        rowById(
          buildActivationChecklist(
            {
              ticketingProvider: 'tito',
              checkinCustomerId: 1,
              checkinEventId: 2,
            },
            [],
          ),
          'ticketing',
        ).done,
      ).toBe(false)
      const row = rowById(
        buildActivationChecklist(
          {
            ticketingProvider: 'tito',
            titoAccountSlug: 'acme',
            titoEventSlug: '2026',
          },
          [],
        ),
        'ticketing',
      )
      expect(row.done).toBe(true)
      expect(row.hint).toMatch(/tito/i)
    })
  })

  describe('system-check reuse', () => {
    it('email-delivery follows the email.resendKey check', () => {
      expect(
        rowById(buildActivationChecklist({}, []), 'email-delivery').done,
      ).toBe(false)
      expect(
        rowById(
          buildActivationChecklist({}, [
            {
              id: 'email.resendKey',
              group: 'email',
              label: 'x',
              status: 'error',
            },
          ]),
          'email-delivery',
        ).done,
      ).toBe(false)
      expect(
        rowById(buildActivationChecklist({}, CHECKS_OK), 'email-delivery').done,
      ).toBe(true)
    })

    it('the optional co-organizers row is done with two organizers', () => {
      const row = rowById(
        buildActivationChecklist(
          { organizers: [{ _ref: 'a' }, { _ref: 'b' }] },
          [],
        ),
        'co-organizers',
      )
      expect(row.done).toBe(true)
      expect(row.optional).toBe(true)
      expect(row.anchor).toBe('#team-content')
    })

    it('the co-organizers row is done once any invitation exists', () => {
      // Any status: sending one proves the invite flow was found, which is all
      // the row asks — a lapsed or revoked invitation still counts.
      const row = rowById(
        buildActivationChecklist({ organizers: [{ _ref: 'founder' }] }, [], {
          hasOrganizerInvitations: true,
        }),
        'co-organizers',
      )
      expect(row.done).toBe(true)
    })

    it('the co-organizers row is outstanding for a lone organizer with no invitations', () => {
      const row = rowById(
        buildActivationChecklist({ organizers: [{ _ref: 'founder' }] }, [], {
          hasOrganizerInvitations: false,
        }),
        'co-organizers',
      )
      expect(row.done).toBe(false)
      // Optional, so a one-person conference can still go live.
      expect(row.optional).toBe(true)
    })

    it('the optional Slack row follows the slack.botToken check', () => {
      expect(rowById(buildActivationChecklist({}, []), 'slack').done).toBe(
        false,
      )
      expect(
        rowById(buildActivationChecklist({}, CHECKS_OK), 'slack').done,
      ).toBe(true)
    })
  })

  it('every row deep-links to an in-page anchor or a settings sub-page', () => {
    for (const row of buildActivationChecklist(FULLY_LIVE, CHECKS_OK).rows) {
      // A same-page anchor, or another settings page — optionally anchored,
      // since the Appearance sections are anchors on one page.
      expect(row.anchor).toMatch(
        /^(#[a-z0-9-]+|\/admin\/settings(\/[a-z0-9-]+)+(#[a-z0-9-]+)?)$/,
      )
      expect(row.anchor.length).toBeGreaterThan(1)
    }
  })

  it('sends the brand-logo row to the Appearance page logos anchor', () => {
    const row = rowById(
      buildActivationChecklist({}, CHECKS_OK),
      'branding-logo',
    )
    expect(row.anchor).toBe('/admin/settings/appearance#logos')
  })
})

describe('the two activation stages', () => {
  it('puts exactly the CFP critical path in the cfp stage', () => {
    // Not a matter of taste: `canAcceptProposals` is formats AND topics, and
    // `isCfpOpen` is the window (@/lib/conference/state). Those three, nothing
    // else — anything extra here would delay a CFP that could already open.
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    expect(
      checklist.rows.filter((r) => r.stage === 'cfp').map((r) => r.id),
    ).toEqual(['cfp-window', 'topics', 'formats'])
  })

  it('orders rows stage-major with Go live still last overall', () => {
    const stages = buildActivationChecklist(FULLY_LIVE, CHECKS_OK).rows.map(
      (r) => r.stage,
    )
    expect(stages.indexOf('launch')).toBe(stages.lastIndexOf('cfp') + 1)
    expect(
      buildActivationChecklist(FULLY_LIVE, CHECKS_OK).rows.at(-1)?.id,
    ).toBe('visibility')
  })

  it('groups every row into a stage and rolls each one up separately', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    expect(checklist.stages.map((s) => s.id)).toEqual(['cfp', 'launch'])
    expect(checklist.stages.flatMap((s) => s.rows).map((r) => r.id)).toEqual(
      checklist.rows.map((r) => r.id),
    )
    expect(checklist.stages.reduce((sum, s) => sum + s.required, 0)).toBe(
      checklist.required,
    )
    expect(checklist.stages.every((s) => s.allDone)).toBe(true)
  })

  it('reports the cfp stage incomplete while the window is unset', () => {
    const checklist = buildActivationChecklist(
      { ...FULLY_LIVE, cfpStartDate: undefined, cfpEndDate: undefined },
      CHECKS_OK,
    )
    const cfp = checklist.stages.find((s) => s.id === 'cfp')
    expect(cfp?.allDone).toBe(false)
    expect(cfp?.done).toBe(2)
    expect(cfp?.required).toBe(3)
    expect(currentActivationStage(checklist)?.id).toBe('cfp')
  })
})

describe('readyToGoLive', () => {
  it('is true when only the launch switch itself is outstanding', () => {
    // `allDone` cannot answer this: an unlisted conference always has the
    // `visibility` row outstanding, so the banner would never graduate.
    const checklist = buildActivationChecklist(
      { ...FULLY_LIVE, visibility: 'unlisted' },
      CHECKS_OK,
    )
    expect(checklist.allDone).toBe(false)
    expect(checklist.readyToGoLive).toBe(true)
  })

  it('is false while any other required row is outstanding', () => {
    const checklist = buildActivationChecklist(
      { ...FULLY_LIVE, visibility: 'unlisted', venueName: undefined },
      CHECKS_OK,
    )
    expect(checklist.readyToGoLive).toBe(false)
  })

  it('is true for a fully configured live conference', () => {
    expect(buildActivationChecklist(FULLY_LIVE, CHECKS_OK).readyToGoLive).toBe(
      true,
    )
  })
})

describe('rows the organizer cannot complete (#839)', () => {
  describe('ticketing', () => {
    it('stays a required row by default — an unresolved answer hides nothing', () => {
      const row = rowById(buildActivationChecklist({}, []), 'ticketing')
      expect(row.unavailable).toBeUndefined()
      expect(row.hint).toMatch(/checkin/i)
    })

    it('is demoted to unavailable for an org without the entitlement', () => {
      const checklist = buildActivationChecklist({}, [], {
        ticketingAvailable: false,
      })
      const row = rowById(checklist, 'ticketing')
      expect(row.unavailable).toBe('Not on your plan')
      expect(row.hint).toMatch(/not part of your plan/i)
    })

    it('drops out of the required rollup when unavailable', () => {
      const withTicketing = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
      const withoutTicketing = buildActivationChecklist(FULLY_LIVE, CHECKS_OK, {
        ticketingAvailable: false,
      })
      expect(withoutTicketing.required).toBe(withTicketing.required - 1)
      // Still LISTED — an absent row would just be a surface that vanished.
      expect(withoutTicketing.rows.map((r) => r.id)).toContain('ticketing')
    })

    it('is never offered as a next step for an unentitled org', () => {
      // Everything else done, ticketing unbound: with the entitlement this is
      // the next step; without it, there is nothing left to ask for.
      const conference: ConferenceForActivation = {
        ...FULLY_LIVE,
        checkinCustomerId: undefined,
        checkinEventId: undefined,
      }
      expect(
        nextActivationSteps(
          buildActivationChecklist(conference, CHECKS_OK),
        ).map((r) => r.id),
      ).toEqual(['ticketing'])
      expect(
        nextActivationSteps(
          buildActivationChecklist(conference, CHECKS_OK, {
            ticketingAvailable: false,
          }),
        ),
      ).toEqual([])
    })
  })

  describe('email delivery', () => {
    it('keeps asking for the Resend key on a self-hosted deployment', () => {
      const row = rowById(buildActivationChecklist({}, []), 'email-delivery')
      expect(row.unavailable).toBeUndefined()
      expect(row.hint).toMatch(/Resend API key/i)
    })

    it('never asks a shared-tier tenant to set a platform variable', () => {
      const row = rowById(
        buildActivationChecklist({}, [], {
          emailDeliveryManagedByPlatform: true,
        }),
        'email-delivery',
      )
      expect(row.unavailable).toBe('Platform-managed')
      expect(row.hint).not.toMatch(/Resend API key/i)
      expect(row.hint).toMatch(/no key here for you to set/i)
    })

    it('drops out of the required rollup when platform-managed', () => {
      const own = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
      const managed = buildActivationChecklist(FULLY_LIVE, CHECKS_OK, {
        emailDeliveryManagedByPlatform: true,
      })
      expect(managed.required).toBe(own.required - 1)
      expect(managed.rows.map((r) => r.id)).toContain('email-delivery')
    })

    it('stops blocking go-live for a tenant that cannot set the key', () => {
      // The platform key is unset (no checks passed) — on the shared platform
      // that is the operator's problem, not a launch blocker for the tenant.
      const conference = { ...FULLY_LIVE, visibility: 'unlisted' }
      expect(buildActivationChecklist(conference, []).readyToGoLive).toBe(false)
      expect(
        buildActivationChecklist(conference, [], {
          emailDeliveryManagedByPlatform: true,
        }).readyToGoLive,
      ).toBe(true)
    })
  })
})

describe('nextActivationSteps', () => {
  it('returns at most two rows, from the first incomplete stage only', () => {
    const steps = nextActivationSteps(buildActivationChecklist({}, []))
    expect(steps).toHaveLength(2)
    expect(steps.every((r) => r.stage === 'cfp')).toBe(true)
  })

  it('honours an explicit limit', () => {
    expect(
      nextActivationSteps(buildActivationChecklist({}, []), 1),
    ).toHaveLength(1)
  })

  it('moves on to the launch stage once the CFP one is satisfied', () => {
    const checklist = buildActivationChecklist(
      {
        cfpStartDate: '2026-01-01',
        cfpEndDate: '2026-03-01',
        topics: [{ _id: 't1' }],
        formats: ['lightning_10'],
      },
      [],
    )
    expect(currentActivationStage(checklist)?.id).toBe('launch')
    expect(nextActivationSteps(checklist).map((r) => r.id)).toEqual([
      'basics',
      'dates',
    ])
  })

  it('never returns an optional row', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, [])
    // Slack and custom-domain are unsatisfied here; neither may surface.
    for (const row of nextActivationSteps(checklist, 99)) {
      expect(row.optional).toBeUndefined()
    }
  })

  it('is empty for a fully activated conference', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    expect(checklist.allDone).toBe(true)
    expect(currentActivationStage(checklist)).toBeNull()
    expect(nextActivationSteps(checklist)).toEqual([])
  })
})

describe('a freshly provisioned tenant — day one on /admin', () => {
  const fresh = provisioned()

  it('provisioning really does leave the CFP window and topics unset', () => {
    // PREMISE GUARD. If provisioning starts seeding either, the expectations
    // below are about a state that no longer exists.
    expect(fresh.cfpStartDate).toBeUndefined()
    expect(fresh.cfpEndDate).toBeUndefined()
    expect(fresh.topics).toBeUndefined()
    expect(fresh.startDate).toBeUndefined()
    expect(fresh.endDate).toBeUndefined()
    // ...and that it DOES seed formats (#833), so the CFP stage is 1/3 done.
    expect(fresh.formats).toEqual([...STARTER_SESSION_FORMATS])
    expect(fresh.visibility).toBe('unlisted')
  })

  it('offers exactly the real critical path as the next steps', () => {
    // Shared-platform tenant: no ticketing entitlement, no email key of its
    // own — the two rows it could never tick.
    const checklist = buildActivationChecklist(fresh, [], {
      ticketingAvailable: false,
      emailDeliveryManagedByPlatform: true,
    })
    expect(currentActivationStage(checklist)?.title).toBe(
      'Open your call for papers',
    )
    expect(nextActivationSteps(checklist).map((r) => r.id)).toEqual([
      'cfp-window',
      'topics',
    ])
  })

  it('shows the hero — it is neither done nor ready to publish', () => {
    const checklist = buildActivationChecklist(fresh, [], {
      ticketingAvailable: false,
      emailDeliveryManagedByPlatform: true,
    })
    expect(checklist.allDone).toBe(false)
    expect(checklist.readyToGoLive).toBe(false)
    expect(checklist.done).toBeGreaterThan(0)
  })

  it('asks it for nothing it cannot do', () => {
    const checklist = buildActivationChecklist(fresh, [], {
      ticketingAvailable: false,
      emailDeliveryManagedByPlatform: true,
    })
    const outstanding = checklist.rows
      .filter((r) => !r.done && !r.optional && !r.unavailable)
      .map((r) => r.id)
    expect(outstanding).not.toContain('ticketing')
    expect(outstanding).not.toContain('email-delivery')
  })
})

describe('the checklist anchor', () => {
  it('points at the card, not at the publish switch', () => {
    // The #839 regression in one assertion: the shell's setup affordance used
    // to deep-link to `#visibility`, an anchor BELOW the checklist.
    expect(ACTIVATION_CHECKLIST_HREF).toBe('/admin/settings#get-started')
    expect(ACTIVATION_CHECKLIST_HREF).not.toContain('visibility')
  })
})

describe('hasTicketingBinding', () => {
  it('defaults an absent provider to checkin', () => {
    expect(
      hasTicketingBinding({ checkinCustomerId: 1, checkinEventId: 2 }),
    ).toBe(true)
    expect(
      hasTicketingBinding({ titoAccountSlug: 'a', titoEventSlug: 'b' }),
    ).toBe(false)
  })
})

describe('hasCustomDomain', () => {
  it('is false with no domains', () => {
    expect(hasCustomDomain(undefined)).toBe(false)
    expect(hasCustomDomain([])).toBe(false)
  })

  it('without a platform suffix, treats >1 domain as custom', () => {
    expect(hasCustomDomain(['only.example.com'])).toBe(false)
    expect(hasCustomDomain(['a.example.com', 'b.example.com'])).toBe(true)
  })

  it('with a platform suffix, ignores that host and its subdomains', () => {
    const suffix = 'cloudnativebergen.dev'
    expect(hasCustomDomain(['foo.cloudnativebergen.dev'], suffix)).toBe(false)
    expect(hasCustomDomain(['cloudnativebergen.dev'], suffix)).toBe(false)
    expect(
      hasCustomDomain(['foo.cloudnativebergen.dev', 'myconf.com'], suffix),
    ).toBe(true)
  })
})
