/**
 * Deterministic demo fixtures (#2150). Pure: same { seed, now } gives
 * deep-equal output. No Math.random, no Date.now.
 *
 * TODO(#2150) full volumes, in a later PR with the copy-writing:
 *   proposals ~40 (every Status), reviews ~3 per submitted proposal,
 *   speakers ~35, sponsors ~12 (every tier and CRM stage), ticket orders ~300,
 *   volunteers ~20, workshop signups ~30, feedback ~150, conversations ~10,
 *   notifications ~25, schedule: 2 tracks x full day with breaks and TBA.
 */
import { Format, Level, Status } from '@/lib/proposal/types'
import type {
  DemoFixtures,
  D1Edition,
  EditionPhase,
  FakePerson,
  Money,
} from './types'

/** mulberry32: tiny, seedable, good enough for fake data. */
export function prng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1))
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const out = [...xs]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  return { next, int, pick, shuffle }
}

const DAY = 86_400_000
const FIRST = [
  'Ingrid',
  'Kwame',
  'Mei',
  'Lars',
  'Amara',
  'Tomás',
  'Priya',
  'Siv',
  'Yusuf',
  'Hanna',
  'Diego',
  'Aiko',
  'Oluwaseun',
  'Freya',
  'Mateusz',
  'Leila',
]
const LAST = [
  'Haugen',
  'Mensah',
  'Lindqvist',
  'Okafor',
  'Ribeiro',
  'Nakamura',
  'Sandvik',
  'Kowalski',
  'Rahman',
  'Berg',
  'Moreau',
  'Achterberg',
  'Iversen',
  'Castellanos',
]
const COMPANIES = [
  'Fjordbyte',
  'Nordlys Systems',
  'Kranvik Cloud',
  'Brygge Data',
  'Sølvpil Labs',
  'Havørn Analytics',
]
const ROLES = [
  'Platform Engineer',
  'Staff SRE',
  'Developer Advocate',
  'Principal Engineer',
  'Security Engineer',
  'Engineering Manager',
]
const TALKS = [
  'Shipping on Fridays: what our rollback budget taught us',
  'Five SLOs that were green while users suffered',
  'eBPF for people who do not write kernels',
  'Multi-tenant Kubernetes without the tears',
  'Supply chain security from commit to cluster, one signature at a time',
  'Platform teams are product teams: lessons from three re-orgs',
  'Cost dashboards nobody opened, and the one everybody did',
  'GitOps at 400 clusters',
]
// TODO(#2150): /demo/*.svg logos do not exist yet; add repo assets with the copy PR.
const AVATAR = '/images/default-avatar.png'

const iso = (ms: number) => new Date(ms).toISOString()
const date = (ms: number) => iso(ms).slice(0, 10)
const nok = (kr: number): Money => ({ amount: kr * 100, currency: 'NOK' })
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function generateDemoFixtures({
  seed,
  now,
}: {
  seed: number
  now: Date
}): DemoFixtures {
  const r = prng(seed)
  const t0 = now.getTime()
  const at = (days: number) => t0 + days * DAY

  const names = r.shuffle(FIRST).map((f, i) => `${f} ${LAST[i % LAST.length]}`)
  let n = 0
  const person = (prefix: string): FakePerson => {
    const name = names[n++ % names.length]
    return {
      key: `${prefix}-${n}`,
      name,
      email: `${slug(name).replace(/-/g, '.')}@example.com`,
      image: AVATAR,
    }
  }

  // --- D1 -------------------------------------------------------------
  const edition = (phase: EditionPhase, offsetDays: number): D1Edition => {
    const year = new Date(at(offsetDays)).getUTCFullYear()
    const start = at(offsetDays)
    return {
      key: `edition-${phase}`,
      phase,
      published: true,
      visibility: 'live',
      title: `KontainerKonf ${year}`,
      tagline: 'Two days of cloud native, by practitioners, for practitioners',
      city: 'Bergen',
      country: 'Norway',
      venueName: 'Kranhallen',
      venueAddress: 'Kaigaten 1, 5015 Bergen',
      startDate: date(start),
      endDate: date(start + DAY),
      logoBright: '/demo/kontainerkonf-bright.svg',
      logoDark: '/demo/kontainerkonf-dark.svg',
      logomarkBright: '/demo/kontainerkonf-mark-bright.svg',
      logomarkDark: '/demo/kontainerkonf-mark-dark.svg',
      primaryColor: '#0f5c8a',
      accentColor: '#f2a541',
      registrationLink: 'https://tickets.example.com/kontainerkonf',
      socialLinks: [
        { label: 'Bluesky', url: 'https://bsky.example.com/kontainerkonf' },
      ],
      cfpStartDate: date(start - 200 * DAY),
      cfpEndDate: date(start - 120 * DAY),
      cfpNotifyDate: date(start - 100 * DAY),
      programDate: date(start - 90 * DAY),
      earlyBirdEndDate: date(start - 60 * DAY),
      travelSupportBudget: 50_000,
      registrationEnabled: phase !== 'past',
      organizerName: 'KontainerKonf AS',
      organizerAddress: 'Kaigaten 1, 5015 Bergen',
      organizerOrgNumber: '999 999 999',
      socialHashtag: '#kontainerkonf',
      showVanityMetrics: true,
      contactEmail: 'hello@kontainerkonf.test',
      cfpEmail: 'cfp@kontainerkonf.test',
      sponsorEmail: 'sponsors@kontainerkonf.test',
      ticketCapacity: 600,
      ticketTargetsEnabled: true,
      ticketSalesStartDate: date(start - 180 * DAY),
    }
  }
  // "live" = CFP closed, program out, event in three weeks.
  const editions = [
    edition('past', -340),
    edition('live', 21),
    edition('upcoming', 385),
  ]
  const live = 'edition-live'

  const members = (
    ['owner', 'admin', 'admin', 'member', 'member'] as const
  ).map((role) => ({ ...person('member'), role }))
  const invites = (['pending', 'pending', 'accepted'] as const).map(
    (status, i) => ({
      key: `invite-${i}`,
      email: `invitee${i + 1}@kontainerkonf.test`,
      role: i === 0 ? ('admin' as const) : ('member' as const),
      status,
      expiresAt: iso(at(7 - i)),
      inviterKey: members[0].key,
    }),
  )

  const speakers = Array.from({ length: 6 }, () => {
    const p = person('speaker')
    const company = r.pick(COMPANIES)
    return {
      ...p,
      title: `${r.pick(ROLES)} at ${company}`,
      slug: slug(p.name),
      bio: `${p.name.split(' ')[0]} builds internal platforms at ${company} and has opinions about YAML.`,
      links: [`https://${slug(p.name)}.example.com`],
      country: 'Norway',
    }
  })
  const speakerProfiles = speakers.map((s) => ({
    userKey: s.key,
    name: s.name,
    bio: s.bio,
    links: s.links,
    topics: ['kubernetes'],
    visibility: 'public' as const,
  }))

  const ticketTypes = [
    {
      key: 'tt-early',
      editionKey: live,
      name: 'Early bird',
      price: nok(2490),
      capacity: 150,
    },
    {
      key: 'tt-regular',
      editionKey: live,
      name: 'Regular',
      price: nok(3490),
      capacity: 400,
    },
  ]
  const ticketOrders = Array.from({ length: 4 }, (_, i) => {
    const tt = r.pick(ticketTypes)
    const quantity = r.int(1, 3)
    return {
      key: `order-${i}`,
      editionKey: live,
      ticketTypeKey: tt.key,
      buyer: person('buyer'),
      quantity,
      total: {
        amount: tt.price.amount * quantity,
        currency: tt.price.currency,
      },
      status: i === 3 ? ('refunded' as const) : ('paid' as const),
      createdAt: iso(at(-r.int(5, 120))),
    }
  })

  // --- Sanity ---------------------------------------------------------
  const statuses = [
    Status.confirmed,
    Status.accepted,
    Status.submitted,
    Status.rejected,
    Status.waitlisted,
    Status.withdrawn,
  ]
  const proposals = statuses.map((status, i) => ({
    key: `proposal-${i}`,
    editionKey: live,
    title: TALKS[i],
    description: `${TALKS[i]}. A practical talk with real numbers and the mistakes we made getting there.`,
    language: 'english' as const,
    format:
      i === 0
        ? Format.workshop_120
        : r.pick([
            Format.presentation_25,
            Format.presentation_40,
            Format.lightning_10,
          ]),
    level: r.pick([Level.beginner, Level.intermediate, Level.advanced]),
    status,
    speakerKeys:
      i === 1
        ? [speakers[1].key, speakers[2].key]
        : [speakers[i % speakers.length].key],
    topics: ['kubernetes'],
  }))
  const reviews = proposals.slice(0, 4).map((p, i) => ({
    key: `review-${i}`,
    proposalKey: p.key,
    reviewerKey: members[i % members.length].key,
    comment:
      'Clear outline and a strong speaker. Would fit the platform track.',
    score: {
      content: r.int(2, 5),
      relevance: r.int(2, 5),
      speaker: r.int(2, 5),
    },
  }))
  const coSpeakerInvitations = (
    ['pending', 'accepted', 'declined'] as const
  ).map((status, i) => {
    const p = person('cospeaker')
    return {
      key: `cospeaker-${i}`,
      proposalKey: proposals[i].key,
      invitedByKey: proposals[i].speakerKeys[0],
      invitedEmail: p.email,
      invitedName: p.name,
      status,
      expiresAt: iso(at(14)),
      createdAt: iso(at(-10)),
    }
  })
  const day = editions[1].startDate
  const schedules = [
    {
      key: 'schedule-day1',
      editionKey: live,
      date: day,
      tracks: [
        {
          trackTitle: 'Platform',
          trackDescription: 'Building and running internal platforms',
          talks: [
            { startTime: '09:00', endTime: '09:40', talkKey: proposals[0].key },
            {
              startTime: '09:40',
              endTime: '10:00',
              placeholder: 'Coffee break',
            },
            { startTime: '10:00', endTime: '10:40', talkKey: proposals[1].key },
            { startTime: '10:40', endTime: '11:20', placeholder: 'TBA' },
          ],
        },
      ],
    },
  ]
  const sponsors = COMPANIES.slice(0, 4).map((name) => ({
    key: `sponsor-${slug(name)}`,
    name,
    website: `https://${slug(name)}.example.com`,
    logo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32" role="img" aria-label="${name}"><text x="0" y="22" font-size="20" font-weight="600" fill="currentColor">${name}</text></svg>`,
  }))
  const sponsorTiers = [
    {
      key: 'tier-gold',
      editionKey: live,
      title: 'Gold',
      tagline: 'Front and centre',
      tierType: 'standard' as const,
      price: nok(80_000),
      maxQuantity: 3,
    },
    {
      key: 'tier-silver',
      editionKey: live,
      title: 'Silver',
      tagline: 'The standard package',
      tierType: 'standard' as const,
      price: nok(40_000),
    },
  ]
  const crm = [
    ['closed-won', 'contract-signed', 'signed', 'paid'],
    ['closed-won', 'contract-signed', 'signed', 'overdue'],
    ['negotiating', 'contract-sent', 'pending', 'not-sent'],
    ['prospect', 'none', 'not-started', 'not-sent'],
  ] as const
  const sponsorsForConference = sponsors.map((s, i) => {
    const [status, contractStatus, signatureStatus, invoiceStatus] = crm[i]
    return {
      key: `sfc-${i}`,
      editionKey: live,
      sponsorKey: s.key,
      tierKey: i === 0 ? 'tier-gold' : 'tier-silver',
      status,
      contractStatus,
      signatureStatus,
      invoiceStatus,
      ...(invoiceStatus === 'paid' || invoiceStatus === 'overdue'
        ? { invoiceSentAt: iso(at(-45)), invoiceDueAt: date(at(-15)) }
        : {}),
      ...(invoiceStatus === 'paid' ? { invoicePaidAt: iso(at(-20)) } : {}),
      assignedToKey: members[1].key,
      contactInitiatedAt: iso(at(-r.int(30, 90))),
    }
  })
  const volunteers = (['pending', 'approved', 'confirmed'] as const).map(
    (status) => ({
      ...person('volunteer'),
      editionKey: live,
      phone: `+47 4${r.int(1000000, 9999999)}`,
      occupation: r.pick(['student', 'working'] as const),
      tshirtSize: r.pick(['S', 'M', 'L', 'XL'] as const),
      status,
      submittedAt: iso(at(-r.int(10, 60))),
    }),
  )
  const workshopSignups = (['confirmed', 'confirmed', 'waitlist'] as const).map(
    (status, i) => ({
      key: `signup-${i}`,
      workshopKey: proposals[0].key,
      user: person('attendee'),
      experienceLevel: r.pick([
        'beginner',
        'intermediate',
        'advanced',
      ] as const),
      operatingSystem: r.pick(['windows', 'macos', 'linux'] as const),
      status,
      signedUpAt: iso(at(-r.int(1, 30))),
    }),
  )
  const travelSupport = (['submitted', 'approved'] as const).map(
    (status, i) => ({
      key: `travel-${i}`,
      editionKey: live,
      speakerKey: speakers[i].key,
      status,
      totalAmount: nok(4200 + i * 1800),
      ...(status === 'approved' ? { approvedAmount: nok(4000) } : {}),
      submittedAt: iso(at(-r.int(5, 40))),
    }),
  )
  // TODO(#2150): point feedback at past-edition talks once those exist.
  const feedback = (['green', 'green', 'yellow', 'red'] as const).map(
    (colour, i) => ({
      key: `feedback-${i}`,
      talkKey: proposals[0].key,
      colour,
      ...(i % 2 === 0
        ? {
            comment: 'Great live demo, slides were hard to read from the back.',
          }
        : {}),
      submittedAt: iso(at(-339)),
    }),
  )
  const conversations = [
    {
      key: 'conversation-0',
      editionKey: live,
      conversationType: 'proposal' as const,
      proposalKey: proposals[1].key,
      messages: [
        {
          authorKey: members[1].key,
          authorName: members[1].name,
          body: 'Could you trim the intro to leave room for questions?',
          origin: 'person' as const,
          createdAt: iso(at(-4)),
        },
        {
          authorKey: speakers[1].key,
          authorName: speakers[1].name,
          body: 'Yes, I will cut it to five minutes.',
          origin: 'person' as const,
          createdAt: iso(at(-3)),
        },
      ],
    },
  ]
  const notifications = [
    {
      key: 'notification-0',
      recipientKey: members[0].key,
      editionKey: live,
      notificationType: 'proposal_submitted' as const,
      title: 'New proposal',
      message: `${speakers[2].name} submitted “${proposals[2].title}”`,
      link: `/admin/proposals/${proposals[2].key}`,
      createdAt: iso(at(-2)),
    },
  ]

  return {
    seed,
    now: iso(t0),
    d1: {
      editions,
      members,
      invites,
      speakerProfiles,
      ticketTypes,
      ticketOrders,
    },
    sanity: {
      branding: {
        logo: '/demo/kontainerkonf-bright.svg',
        logomark: '/demo/kontainerkonf-mark-bright.svg',
        primaryColor: '#0f5c8a',
        accentColor: '#f2a541',
      },
      speakers,
      proposals,
      reviews,
      coSpeakerInvitations,
      schedules,
      sponsors,
      sponsorTiers,
      sponsorsForConference,
      volunteers,
      workshopSignups,
      travelSupport,
      feedback,
      conversations,
      notifications,
    },
  }
}
