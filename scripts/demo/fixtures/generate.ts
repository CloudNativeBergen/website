/**
 * Deterministic demo fixtures (#2150). Pure: same { seed, now } gives
 * deep-equal output. No Math.random, no Date.now.
 *
 * Volumes (live edition unless noted): 40 proposals in every Status, ~3
 * reviews per reviewable proposal, 2-day 2-track program with breaks and TBA,
 * 12 sponsors over every tier and CRM stage, 20 volunteers, 30 workshop
 * signups, ~150 feedback responses on the past edition, 10 conversations,
 * 25 notifications, 150 ticket orders.
 */
import { Format, Level, Status } from '@/lib/proposal/types'
import { brandingSvgs, sponsorLogoSvg } from '../assets'
import type { DemoFixtures, D1Edition, FakePerson, Money } from './types'
import {
  BIO_TAILS,
  COMPANIES,
  FEEDBACK_COMMENTS,
  FIRST,
  LAST,
  REVIEW_COMMENTS,
  ROLES,
  SPONSOR_BRANDS,
  TALKS,
} from './copy'
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
// Sanity speakers get generated avatars in seed.ts (scripts/demo/assets.ts).
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

  // Every first × last pair, shuffled: names (and so emails) never repeat.
  const names = r.shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)))
  let n = 0
  const person = (prefix: string): FakePerson => {
    if (n >= names.length) throw new Error('demo fixtures: out of unique names')
    const name = names[n++]
    return {
      key: `${prefix}-${n}`,
      name,
      email: `${slug(name).replace(/-/g, '.')}@example.com`,
      image: AVATAR,
    }
  }

  // --- D1 -------------------------------------------------------------
  const edition = (phase: string, offsetDays: number): D1Edition => {
    const year = new Date(at(offsetDays)).getUTCFullYear()
    const start = at(offsetDays)
    return {
      key: `edition-${phase}`,
      lifecycle: 'live',
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
      primaryColor: '#0f5c8a',
      accentColor: '#f2a541',
      registrationLink: 'https://tickets.example.com/kontainerkonf',
      socialLinks: ['https://bsky.example.com/kontainerkonf'],
      cfpStartDate: date(start - 200 * DAY),
      cfpEndDate: date(start - 120 * DAY),
      cfpNotifyDate: date(start - 100 * DAY),
      programDate: date(start - 90 * DAY),
      earlyBirdEndDate: date(start - 60 * DAY),
      travelSupportBudget: 50_000,
      registrationEnabled: phase !== 'past',
      organizer: 'KontainerKonf AS',
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

  const past = editions[0].key

  const members = (
    ['owner', 'admin', 'admin', 'member', 'member', 'member'] as const
  ).map((role) => ({ ...person('member'), role }))
  const invites = (
    ['pending', 'pending', 'accepted', 'rejected', 'canceled'] as const
  ).map((status, i) => ({
    key: `invite-${i}`,
    email: `invitee${i + 1}@kontainerkonf.test`,
    role: i === 0 ? ('admin' as const) : ('member' as const),
    status,
    expiresAt: iso(at(status === 'pending' ? 7 - i : -3 - i)),
    inviterKey: members[i % 2].key,
  }))

  const speakers = Array.from({ length: 34 }, (_, i) => {
    const p = person('speaker')
    const company = r.pick(COMPANIES)
    const first = p.name.split(' ')[0]
    return {
      ...p,
      title: `${r.pick(ROLES)} at ${company}`,
      slug: slug(p.name),
      bio:
        i % 3 === 0
          ? `${first} works on infrastructure at ${company}.`
          : `${first} builds internal platforms at ${company}. ${r.pick(BIO_TAILS)}`,
      links: [`https://${slug(p.name)}.example.com`],
      country: r.pick([
        'Norway',
        'Norway',
        'Sweden',
        'Denmark',
        'Nigeria',
        'Japan',
        'Poland',
        'Brazil',
      ]),
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
    {
      key: 'tt-student',
      editionKey: live,
      name: 'Student',
      price: nok(490),
      capacity: 50,
    },
  ]
  const ticketOrders = Array.from({ length: 150 }, (_, i) => {
    const tt = i < 60 ? ticketTypes[0] : r.pick(ticketTypes.slice(1))
    const quantity = r.int(1, 3)
    const createdAt = iso(at(-r.int(5, 170)))
    return {
      key: `order-${i}`,
      editionKey: live,
      status:
        i % 25 === 7
          ? ('cancelled' as const)
          : i % 31 === 3
            ? ('pending' as const)
            : ('paid' as const),
      total: {
        amount: tt.price.amount * quantity,
        currency: tt.price.currency,
      },
      buyerEmail: `buyer${i + 1}@kontainerkonf.test`,
      lines: [{ ticketTypeKey: tt.key, quantity, unitPrice: tt.price }],
      createdAt,
      updatedAt: createdAt,
    }
  })

  // --- Sanity ---------------------------------------------------------
  // 40 live proposals; the first 18 (confirmed + accepted) make the program.
  const statusPlan: Status[] = [
    ...Array<Status>(14).fill(Status.confirmed),
    ...Array<Status>(4).fill(Status.accepted),
    ...Array<Status>(8).fill(Status.submitted),
    ...Array<Status>(3).fill(Status.waitlisted),
    ...Array<Status>(5).fill(Status.rejected),
    ...Array<Status>(2).fill(Status.withdrawn),
    Status.draft,
    Status.canceled,
  ]
  const talkFormat = (title: string) =>
    /^(Hands-on|Workshop)/.test(title)
      ? Format.workshop_120
      : r.pick([
          Format.presentation_25,
          Format.presentation_40,
          Format.presentation_40,
          Format.lightning_10,
        ])
  const proposal = (i: number, editionKey: string, status: Status) => {
    const [title, description, topic] = TALKS[i]
    return {
      key: `proposal-${i}`,
      editionKey,
      title,
      description,
      language: i % 9 === 4 ? ('norwegian' as const) : ('english' as const),
      format: talkFormat(title),
      level: r.pick([Level.beginner, Level.intermediate, Level.advanced]),
      status,
      // Every fifth talk has a co-speaker.
      speakerKeys:
        i % 5 === 1
          ? [speakers[i % 34].key, speakers[(i + 7) % 34].key]
          : [speakers[i % 34].key],
      topics: [topic],
    }
  }
  // Interleave so workshops (indices 24, 25) land in the program.
  const order = r.shuffle(
    Array.from({ length: 40 }, (_, i) => i).filter((i) => i !== 24 && i !== 25),
  )
  order.splice(2, 0, 24)
  order.splice(9, 0, 25)
  const proposals = order.map((i, n) => proposal(i, live, statusPlan[n]))
  const pastTalks = Array.from({ length: 6 }, (_, j) =>
    proposal(40 + j, past, Status.confirmed),
  )
  const programmed = proposals.slice(0, 18)

  const reviewable = proposals.filter((p) => p.status !== Status.draft)
  const reviews = reviewable.flatMap((p, i) =>
    Array.from({ length: 2 + (i % 3) }, (_, j) => ({
      key: `review-${p.key}-${j}`,
      proposalKey: p.key,
      reviewerKey: members[j % 4].key,
      comment: REVIEW_COMMENTS[(i + j) % REVIEW_COMMENTS.length],
      score: {
        content: r.int(4, 10),
        relevance: r.int(4, 10),
        speaker: r.int(4, 10),
      },
    })),
  )
  const coSpeakerInvitations = (
    ['pending', 'accepted', 'declined', 'expired', 'pending'] as const
  ).map((status, i) => {
    const p = person('cospeaker')
    const prop = proposals[i * 3]
    return {
      key: `cospeaker-${i}`,
      proposalKey: prop.key,
      invitedByKey: prop.speakerKeys[0],
      invitedEmail: p.email,
      invitedName: p.name,
      status,
      expiresAt: iso(at(status === 'expired' ? -2 : 14)),
      createdAt: iso(at(-10 - i)),
    }
  })

  // Program: 2 days x 2 tracks, 5 talk slots each = 20 slots for 18 talks + 2 TBA.
  const TIMES = [
    ['09:00', '09:40'],
    ['09:50', '10:30'],
    ['11:00', '11:40'],
    ['13:00', '13:40'],
    ['13:50', '14:30'],
  ]
  const breaks = [
    {
      at: 2,
      startTime: '10:30',
      endTime: '11:00',
      placeholder: 'Coffee break',
    },
    { at: 3, startTime: '11:40', endTime: '13:00', placeholder: 'Lunch' },
  ]
  let next = 0
  const trackTalks = (tba: boolean) =>
    TIMES.flatMap(([startTime, endTime], s) => {
      const brk = breaks
        .filter((b) => b.at === s)
        .map(({ startTime, endTime, placeholder }) => ({
          startTime,
          endTime,
          placeholder,
        }))
      const slot =
        tba && s === 4
          ? { startTime, endTime, placeholder: 'TBA' }
          : { startTime, endTime, talkKey: programmed[next++].key }
      return [...brk, slot]
    })
  const day = (n: number, start: number) => date(start + n * DAY)
  const liveStart = Date.parse(editions[1].startDate)
  const pastStart = Date.parse(editions[0].startDate)
  const schedules = [0, 1].map((d) => ({
    key: `schedule-day${d + 1}`,
    editionKey: live,
    date: day(d, liveStart),
    tracks: [
      {
        trackTitle: 'Fjord Hall',
        trackDescription:
          'Platform engineering, delivery and developer experience',
        talks: trackTalks(d === 1),
      },
      {
        trackTitle: 'Harbour Room',
        trackDescription: 'Security, reliability and observability',
        talks: trackTalks(d === 1),
      },
    ],
  }))
  schedules.push({
    key: 'schedule-past-day1',
    editionKey: past,
    date: day(0, pastStart),
    tracks: [
      {
        trackTitle: 'Main stage',
        trackDescription: 'Everything, in one room',
        talks: pastTalks.map((t, s) => ({
          startTime: `${String(9 + s).padStart(2, '0')}:00`,
          endTime: `${String(9 + s).padStart(2, '0')}:40`,
          talkKey: t.key,
        })),
      },
    ],
  })

  const sponsors = SPONSOR_BRANDS.map(([name]) => ({
    key: `sponsor-${slug(name)}`,
    name,
    website: `https://${slug(name)}.example.com`,
    logo: sponsorLogoSvg(name),
  }))
  const tier = (
    key: string,
    title: string,
    tagline: string,
    tierType: 'standard' | 'special' | 'addon',
    kr: number,
    maxQuantity?: number,
  ) => ({
    key: `tier-${key}`,
    editionKey: live,
    title,
    tagline,
    tierType,
    price: nok(kr),
    ...(maxQuantity ? { maxQuantity } : {}),
  })
  const sponsorTiers = [
    tier(
      'platinum',
      'Platinum',
      'Your name on the day itself, with a welcome from the main stage',
      'standard',
      150_000,
      2,
    ),
    tier('gold', 'Gold', 'Front and centre', 'standard', 80_000, 4),
    tier('silver', 'Silver', 'The standard package', 'standard', 40_000),
    tier(
      'community',
      'Community',
      'For startups and non-profits',
      'standard',
      10_000,
    ),
    tier(
      'diversity',
      'Diversity scholarship',
      'Fund travel and tickets for underrepresented speakers',
      'special',
      25_000,
    ),
    tier('coffee', 'Coffee bar', 'Your logo on every cup', 'addon', 15_000, 1),
  ]
  // [tier, status, contract, signature, invoice]: every tier and every stage.
  const crm = [
    ['platinum', 'closed-won', 'contract-signed', 'signed', 'paid'],
    ['platinum', 'negotiating', 'contract-sent', 'pending', 'not-sent'],
    ['gold', 'closed-won', 'contract-signed', 'signed', 'overdue'],
    ['gold', 'closed-won', 'contract-signed', 'signed', 'sent'],
    ['gold', 'closed-won', 'registration-sent', 'not-started', 'not-sent'],
    ['silver', 'closed-won', 'contract-signed', 'signed', 'paid'],
    ['silver', 'negotiating', 'verbal-agreement', 'not-started', 'not-sent'],
    ['silver', 'contacted', 'none', 'not-started', 'not-sent'],
    ['community', 'prospect', 'none', 'not-started', 'not-sent'],
    ['diversity', 'closed-won', 'contract-signed', 'signed', 'paid'],
    ['coffee', 'closed-lost', 'contract-sent', 'expired', 'cancelled'],
    ['community', 'closed-won', 'contract-sent', 'rejected', 'not-sent'],
  ] as const
  const sponsorsForConference = sponsors.map((s, i) => {
    const [t, status, contractStatus, signatureStatus, invoiceStatus] = crm[i]
    const invoiced = ['sent', 'paid', 'overdue', 'cancelled'].includes(
      invoiceStatus,
    )
    return {
      key: `sfc-${i}`,
      editionKey: live,
      sponsorKey: s.key,
      tierKey: `tier-${t}`,
      status,
      contractStatus,
      signatureStatus,
      invoiceStatus,
      ...(invoiced
        ? {
            invoiceSentAt: iso(at(-45 + i)),
            invoiceDueAt: date(at(invoiceStatus === 'sent' ? 10 : -15)),
          }
        : {}),
      ...(invoiceStatus === 'paid' ? { invoicePaidAt: iso(at(-20 + i)) } : {}),
      ...(status === 'prospect'
        ? {}
        : { assignedToKey: members[1 + (i % 2)].key }),
      contactInitiatedAt: iso(at(-r.int(30, 120))),
    }
  })

  const volStatus = [
    'pending',
    'approved',
    'confirmed',
    'confirmed',
    'rejected',
  ] as const
  const volunteers = Array.from({ length: 20 }, (_, i) => ({
    ...person('volunteer'),
    editionKey: live,
    phone: `+47 4${r.int(1000000, 9999999)}`,
    occupation: r.pick([
      'student',
      'student',
      'working',
      'unemployed',
      'other',
    ] as const),
    tshirtSize: r.pick(['XS', 'S', 'M', 'M', 'L', 'XL', 'XXL'] as const),
    status: volStatus[i % volStatus.length],
    submittedAt: iso(at(-r.int(10, 90))),
  }))
  const workshops = programmed.filter((p) => p.format === Format.workshop_120)
  const workshopSignups = Array.from({ length: 30 }, (_, i) => ({
    key: `signup-${i}`,
    workshopKey: workshops[i % workshops.length].key,
    user: person('attendee'),
    experienceLevel: r.pick(['beginner', 'intermediate', 'advanced'] as const),
    operatingSystem: r.pick(['windows', 'macos', 'macos', 'linux'] as const),
    status: i >= 26 ? ('waitlist' as const) : ('confirmed' as const),
    signedUpAt: iso(at(-r.int(1, 30))),
  }))
  const travelSupport = (
    ['draft', 'submitted', 'approved', 'paid', 'rejected'] as const
  ).map((status, i) => ({
    key: `travel-${i}`,
    editionKey: live,
    speakerKey: speakers[i * 2 + 1].key,
    status,
    totalAmount: nok(2400 + i * 1900),
    ...(status === 'approved' || status === 'paid'
      ? { approvedAmount: nok(2000 + i * 1500) }
      : {}),
    ...(status === 'draft' ? {} : { submittedAt: iso(at(-r.int(5, 40))) }),
  }))
  const pastAt = (pastStart - t0) / DAY
  const feedback = pastTalks.flatMap((t, ti) =>
    Array.from({ length: 22 + ti * 2 }, (_, i) => {
      const roll = r.next()
      const colour =
        roll < 0.62
          ? ('green' as const)
          : roll < 0.88
            ? ('yellow' as const)
            : ('red' as const)
      return {
        key: `feedback-${t.key}-${i}`,
        talkKey: t.key,
        colour,
        ...(i % 4 === 0
          ? { comment: FEEDBACK_COMMENTS[(ti + i) % FEEDBACK_COMMENTS.length] }
          : {}),
        submittedAt: iso(at(pastAt) + (9 + ti) * 3_600_000 + i * 60_000),
      }
    }),
  )

  const msg = (
    who: { key: string; name: string },
    body: string,
    daysAgo: number,
  ) => ({
    authorKey: who.key,
    authorName: who.name,
    body,
    origin: 'person' as const,
    createdAt: iso(at(-daysAgo)),
  })
  const proposalThreads: [string, string][] = [
    [
      'Could you trim the intro to leave room for questions?',
      'Yes, I will cut it to five minutes.',
    ],
    [
      'Do you need a second microphone for the live demo?',
      'That would be great, thank you!',
    ],
    [
      'We would love a slightly more advanced version of this. Is that possible?',
      'Absolutely. I can drop the basics and go straight into the failure modes.',
    ],
    ['Your slides are due next Friday.', 'Noted, they will be there.'],
    [
      'Can you confirm your travel dates?',
      'Arriving the evening before, leaving the day after.',
    ],
    [
      'Would you be open to moving to the afternoon slot on day two?',
      'Works for me.',
    ],
  ]
  const conversations = [
    ...proposalThreads.map(([q, a], i) => {
      const p = programmed[i]
      const sp = speakers.find((s) => s.key === p.speakerKeys[0])!
      return {
        key: `conversation-${i}`,
        editionKey: live,
        conversationType: 'proposal' as const,
        proposalKey: p.key,
        messages: [
          msg(members[1 + (i % 2)], q, 6 - i * 0.5),
          msg(sp, a, 5 - i * 0.5),
        ],
      }
    }),
    ...[0, 2, 5].map((s, i) => ({
      key: `conversation-sponsor-${i}`,
      editionKey: live,
      conversationType: 'sponsor' as const,
      sponsorForConferenceKey: sponsorsForConference[s].key,
      messages: [
        msg(
          members[1],
          'Here is the exhibitor guide with load-in times and stand dimensions.',
          9 - i,
        ),
        {
          authorName: sponsors[s].name,
          body: 'Thanks! Can we bring a 2 m banner?',
          origin: 'person' as const,
          createdAt: iso(at(-8 + i)),
        },
      ],
    })),
    {
      key: 'conversation-general-0',
      editionKey: live,
      conversationType: 'general' as const,
      messages: [
        {
          authorName: 'KontainerKonf',
          body: 'Speaker dinner is confirmed for the evening before day one.',
          origin: 'system' as const,
          createdAt: iso(at(-2)),
        },
      ],
    },
  ]

  const notificationKinds = [
    'proposal_submitted',
    'proposal_status_changed',
    'message_received',
    'cospeaker_response',
    'travel_support_update',
    'sponsor_activity',
  ] as const
  const notifications = Array.from({ length: 25 }, (_, i) => {
    const notificationType = notificationKinds[i % notificationKinds.length]
    const p = proposals[(i * 7) % 40]
    const sp = speakers.find((s) => s.key === p.speakerKeys[0])!
    const sfc = sponsors[i % sponsors.length]
    const text = {
      proposal_submitted: [
        'New proposal',
        `${sp.name} submitted “${p.title}”`,
        `/admin/proposals/${p.key}`,
      ],
      proposal_status_changed: [
        'Proposal updated',
        `“${p.title}” is now ${p.status}`,
        `/admin/proposals/${p.key}`,
      ],
      message_received: [
        'New message',
        `${sp.name} replied about “${p.title}”`,
        `/admin/proposals/${p.key}`,
      ],
      cospeaker_response: [
        'Co-speaker responded',
        `A co-speaker answered the invitation for “${p.title}”`,
        `/admin/proposals/${p.key}`,
      ],
      travel_support_update: [
        'Travel support',
        `${sp.name} submitted a travel support request`,
        '/admin/travel-support',
      ],
      sponsor_activity: [
        'Sponsor activity',
        `${sfc.name} opened the sponsor portal`,
        '/admin/sponsors',
      ],
    }[notificationType]
    return {
      key: `notification-${i}`,
      recipientKey: members[i % 3].key,
      editionKey: live,
      notificationType,
      title: text[0],
      message: text[1],
      link: text[2],
      ...(i >= 8 ? { readAt: iso(at(-i / 4)) } : {}),
      createdAt: iso(at(-i / 3)),
    }
  })

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
        ...brandingSvgs(),
        primaryColor: '#0f5c8a',
        accentColor: '#f2a541',
      },
      speakers,
      proposals: [...proposals, ...pastTalks],
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
