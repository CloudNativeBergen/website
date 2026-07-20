import { describe, it, expect } from 'vitest'
import {
  nextEditionTitle,
  addYearsToDate,
  nextEditionDefaults,
  buildEditionDocuments,
  DEFAULT_CLONE_FLAGS,
  type CloneFlags,
  type SourceConference,
  type SourceSponsorTier,
  type SourceContractTemplate,
  type CreateEditionInput,
} from './edition'

// A deterministic id/key minter so assertions are stable.
function minter(prefix: string) {
  let n = 0
  return () => `${prefix}-${++n}`
}

const SOURCE: SourceConference = {
  _id: 'source-conf',
  title: 'Cloud Native Days Bergen 2025',
  organizer: 'Cloud Native Bergen',
  organizerOrgNumber: '123456789',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  logoBright: '<svg id="bright" />',
  logoDark: '<svg id="dark" />',
  topics: [
    { _type: 'reference', _ref: 'topic-a', _key: 'k1' },
    { _type: 'reference', _ref: 'topic-b', _key: 'k2' },
  ],
  formats: ['lightning_10', 'presentation_25'],
  organizers: [
    { _type: 'reference', _ref: 'sp-1', _key: 'o1' },
    { _type: 'reference', _ref: 'sp-2', _key: 'o2' },
  ],
  teams: [{ _type: 'organizerTeam', key: 'cfp', title: 'CFP', members: [] }],
  contactEmail: 'hi@cnb.no',
  cfpEmail: 'cfp@cnb.no',
  sponsorEmail: 'sales@cnb.no',
  salesNotificationChannel: '#sales',
  socialLinks: ['https://x.com/cnb'],
  cfpSubmissionGoal: 100,
  sponsorRevenueGoal: 500000,
  signingProvider: 'self-hosted',
  sponsorBenefits: [{ title: 'Reach', description: 'Devs' }],
  sponsorshipCustomization: { heroHeadline: 'Sponsor us' },
  agentConfig: { conferenceContext: 'A cloud native conf' },
}

const SOURCE_TIERS: SourceSponsorTier[] = [
  {
    _id: 'tier-gold',
    title: 'Gold',
    tagline: 'Top',
    tierType: 'standard',
    price: [{ amount: 50000, currency: 'NOK' }],
    perks: [{ label: 'Booth' }],
  },
  { _id: 'tier-media', title: 'Media', tierType: 'special' },
]

const SOURCE_TEMPLATES: SourceContractTemplate[] = [
  {
    _id: 'tpl-gold',
    title: 'Gold contract',
    tier: { _type: 'reference', _ref: 'tier-gold' },
    sections: [{ heading: 'Terms' }],
    isDefault: true,
  },
  {
    _id: 'tpl-generic',
    title: 'Generic contract',
    sections: [{ heading: 'Generic' }],
  },
]

function makeInput(
  overrides: Partial<CreateEditionInput> = {},
): CreateEditionInput {
  return {
    title: 'Cloud Native Days Bergen 2026',
    organizer: null,
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    cfpStartDate: '2026-01-01',
    cfpEndDate: '2026-03-01',
    cfpNotifyDate: '2026-03-15',
    programDate: '2026-04-01',
    domains: ['2026.cnb.no'],
    clone: { ...DEFAULT_CLONE_FLAGS },
    ...overrides,
  }
}

function build(input: CreateEditionInput, source = SOURCE) {
  return buildEditionDocuments(
    {
      conference: source,
      sponsorTiers: SOURCE_TIERS,
      contractTemplates: SOURCE_TEMPLATES,
    },
    input,
    {
      newConferenceId: 'new-conf',
      mintId: minter('doc'),
      mintKey: minter('key'),
    },
  )
}

describe('nextEditionTitle', () => {
  it('bumps the first 4-digit year', () => {
    expect(nextEditionTitle('CND Bergen 2025')).toBe('CND Bergen 2026')
  })
  it('leaves titles without a year unchanged', () => {
    expect(nextEditionTitle('Cloud Native Days')).toBe('Cloud Native Days')
  })
})

describe('addYearsToDate', () => {
  it('adds a year', () => {
    expect(addYearsToDate('2025-06-15')).toBe('2026-06-15')
  })
  it('clamps Feb-29 to Feb-28 in a non-leap target year', () => {
    expect(addYearsToDate('2024-02-29')).toBe('2025-02-28')
  })
  it('returns empty for missing/malformed input', () => {
    expect(addYearsToDate(undefined)).toBe('')
    expect(addYearsToDate('nope')).toBe('')
  })
})

describe('nextEditionDefaults', () => {
  it('derives a full prefill from the source', () => {
    const d = nextEditionDefaults(SOURCE)
    expect(d.title).toBe('Cloud Native Days Bergen 2026')
    expect(d.organizer).toBe('Cloud Native Bergen')
  })
})

describe('buildEditionDocuments — always-applied invariants', () => {
  it('creates a fresh conference id distinct from the source', () => {
    const { conference } = build(makeInput())
    expect(conference._id).toBe('new-conf')
    expect(conference._id).not.toBe(SOURCE._id)
    expect(conference._type).toBe('conference')
  })

  it('never opens registration on a new edition', () => {
    const { conference } = build(makeInput())
    expect(conference.registrationEnabled).toBe(false)
  })

  it('always copies identity (city, logos) and normalizes domains', () => {
    const { conference } = build(
      makeInput({ domains: ['2026.CNB.no', 'ALT.example.com'] }),
    )
    expect(conference.city).toBe('Bergen')
    expect(conference.logoBright).toBe('<svg id="bright" />')
    expect(conference.domains).toEqual(['2026.cnb.no', 'alt.example.com'])
  })

  it('uses the input organizer when provided, else the source', () => {
    expect(build(makeInput({ organizer: null })).conference.organizer).toBe(
      'Cloud Native Bergen',
    )
    expect(
      build(makeInput({ organizer: 'New Org' })).conference.organizer,
    ).toBe('New Org')
  })

  it('never carries source content (schedules/announcement) into the clone', () => {
    const { conference } = build(makeInput())
    expect(conference.schedules).toBeUndefined()
    expect(conference.announcement).toBeUndefined()
    expect(conference.featuredTalks).toBeUndefined()
    expect(conference.vanityMetrics).toBeUndefined()
  })
})

describe('buildEditionDocuments — clone flag matrix', () => {
  const allOff: CloneFlags = Object.fromEntries(
    Object.keys(DEFAULT_CLONE_FLAGS).map((k) => [k, false]),
  ) as CloneFlags

  it('flag OFF → family absent', () => {
    const { conference, sponsorTiers, contractTemplates, summary } = build(
      makeInput({ clone: allOff }),
    )
    expect(conference.topics).toBeUndefined()
    expect(conference.formats).toBeUndefined()
    expect(conference.organizers).toBeUndefined()
    expect(conference.teams).toBeUndefined()
    expect(conference.agentConfig).toBeUndefined()
    expect(conference.sponsorBenefits).toBeUndefined()
    expect(conference.contactEmail).toBeUndefined()
    expect(conference.cfpSubmissionGoal).toBeUndefined()
    expect(sponsorTiers).toHaveLength(0)
    expect(contractTemplates).toHaveLength(0)
    expect(summary).toEqual({})
  })

  it('flag ON → topics/organizers ref arrays copied by _ref', () => {
    const { conference } = build(makeInput())
    expect(conference.topics).toEqual([
      { _type: 'reference', _ref: 'topic-a', _key: 'key-1' },
      { _type: 'reference', _ref: 'topic-b', _key: 'key-2' },
    ])
    expect(
      (conference.organizers as Array<{ _ref: string }>).map((o) => o._ref),
    ).toEqual(['sp-1', 'sp-2'])
  })

  it('flag ON → sponsor tiers become NEW docs pointing at the new conference', () => {
    const { sponsorTiers } = build(makeInput())
    expect(sponsorTiers).toHaveLength(2)
    for (const tier of sponsorTiers) {
      expect(tier._type).toBe('sponsorTier')
      expect(tier._id).not.toBe('tier-gold')
      expect(tier._id).not.toBe('tier-media')
      expect(tier.conference).toEqual({
        _type: 'reference',
        _ref: 'new-conf',
      })
    }
    expect(sponsorTiers[0].title).toBe('Gold')
  })

  it('flag ON → contract template conference ref points at new, tier ref remapped', () => {
    const { sponsorTiers, contractTemplates } = build(makeInput())
    const goldNewId = sponsorTiers[0]._id
    const goldTpl = contractTemplates.find((t) => t.title === 'Gold contract')!
    expect(goldTpl.conference).toEqual({
      _type: 'reference',
      _ref: 'new-conf',
    })
    expect(goldTpl.tier).toEqual({ _type: 'reference', _ref: goldNewId })
  })

  it('drops a template tier ref when tiers were NOT cloned (would dangle)', () => {
    const { contractTemplates } = build(
      makeInput({
        clone: { ...DEFAULT_CLONE_FLAGS, sponsorTiers: false },
      }),
    )
    const goldTpl = contractTemplates.find((t) => t.title === 'Gold contract')!
    expect(goldTpl.tier).toBeUndefined()
    expect(goldTpl.conference).toEqual({
      _type: 'reference',
      _ref: 'new-conf',
    })
  })

  it('summary reports per-family counts', () => {
    const { summary } = build(makeInput())
    expect(summary).toMatchObject({
      topics: 2,
      formats: 2,
      organizers: 2,
      teams: 1,
      sponsorTiers: 2,
      contractTemplates: 2,
      sponsorshipCopy: 1,
      cfpGoals: 1,
      agentConfig: 1,
      emailsAndChannels: 1,
    })
  })
})

describe('cloned tier soldOut policy (SE-5 badge)', () => {
  it('never copies soldOut onto a cloned tier (operational state, not structure)', () => {
    let n = 0
    const docs = buildEditionDocuments(
      {
        conference: SOURCE,
        sponsorTiers: [
          { _id: 'tier-sold', title: 'Gold', soldOut: true },
        ] as SourceSponsorTier[],
        contractTemplates: [],
      },
      {
        title: 'Next',
        startDate: '2027-01-01',
        endDate: '2027-01-02',
        domains: ['2027.cnb.no'],
        clone: { ...DEFAULT_CLONE_FLAGS, sponsorTiers: true },
      } as CreateEditionInput,
      {
        newConferenceId: 'new-conf',
        mintId: () => `id-${++n}`,
        mintKey: () => `key-${++n}`,
      },
    )
    const tier = docs.sponsorTiers[0]
    expect(tier).toBeDefined()
    expect(tier).not.toHaveProperty('soldOut')
  })
})
