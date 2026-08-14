import { describe, it, expect } from 'vitest'
import { buildInvitationLetterContent, costCoverageSentence } from './content'
import type { ConfirmedSession, InvitationLetterDetails } from './types'
import type { Conference } from '@/lib/conference/types'
import { Format } from '@/lib/proposal/types'

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Bergen',
  organizerOrgNumber: '933338622',
  organizerAddress: 'Event Plaza 1, 5003 Bergen',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Bergen Conference Center',
  venueAddress: 'Conference Way 10',
  startDate: '2026-11-05',
  endDate: '2026-11-06',
  contactEmail: 'hello@cloudnativedays.no',
  organizers: [],
  domains: ['cloudnativedays.no'],
  formats: [Format.presentation_25],
  topics: [],
  registrationEnabled: true,
  cfpStartDate: '2026-06-01',
  cfpEndDate: '2026-08-31',
  cfpNotifyDate: '2026-09-15',
  programDate: '2026-10-01',
} as unknown as Conference

const details: InvitationLetterDetails = {
  fullName: 'Amina Yusuf',
  dateOfBirth: '1990-04-12',
  nationality: 'Kenyan',
  passportNumber: 'A1234567',
  role: 'attendee',
  costCoverage: {
    registrationFee: false,
    travel: false,
    accommodation: false,
  },
}

const build = (overrides: Partial<InvitationLetterDetails> = {}) =>
  buildInvitationLetterContent({
    details: { ...details, ...overrides },
    conference,
    signatory: {
      name: 'Hans Kristian Flaatten',
      title: 'Conference Chair',
      email: 'chair@cloudnativedays.no',
    },
    reference: 'CNDN-2026-INV-0007',
    issuedAt: '2026-08-03T09:00:00Z',
  })

describe('costCoverageSentence', () => {
  it('states plainly when the applicant bears everything', () => {
    const sentence = costCoverageSentence({
      registrationFee: false,
      travel: false,
      accommodation: false,
    })

    expect(sentence).toContain('borne by the applicant')
    expect(sentence).toContain('no financial responsibility')
  })

  it('names what is covered AND what is not', () => {
    const sentence = costCoverageSentence({
      registrationFee: true,
      travel: false,
      accommodation: false,
    })

    expect(sentence).toContain(
      'The organizer covers the conference registration fee',
    )
    expect(sentence).toContain('Travel costs and accommodation are borne')
  })

  it('uses a singular verb for a single uncovered item', () => {
    const sentence = costCoverageSentence({
      registrationFee: true,
      travel: true,
      accommodation: false,
    })

    expect(sentence).toContain('Accommodation is borne by the applicant')
  })

  it('closes the door when everything is covered', () => {
    const sentence = costCoverageSentence({
      registrationFee: true,
      travel: true,
      accommodation: true,
    })

    expect(sentence).toContain(
      'the conference registration fee, travel costs and accommodation',
    )
    expect(sentence).toContain('No further financial commitment')
  })
})

describe('buildInvitationLetterContent', () => {
  it('builds an English letterhead with a formatted org. number', () => {
    const content = build()

    expect(content.organizerLines[0]).toBe('Cloud Native Bergen')
    expect(content.organizerLines[1]).toMatch(/^Org\. no\. 933/)
    expect(content.organizerLines[2]).toBe('Event Plaza 1, 5003 Bergen')
  })

  it('writes dates in English, not the house locale', () => {
    const content = build()

    expect(content.issuedOn).toBe('3 August 2026')
    expect(
      content.applicantRows.find((row) => row.label === 'Date of birth')?.value,
    ).toBe('12 April 1990')
  })

  it('carries the passport identifiers a consulate checks', () => {
    const content = build({ passportExpiry: '2030-01-31' })
    const labels = content.applicantRows.map((row) => row.label)

    expect(labels).toEqual([
      'Full name',
      'Date of birth',
      'Nationality',
      'Passport number',
      'Passport valid until',
    ])
  })

  it('carries the fields a consulate cross-checks against the application', () => {
    const rows = Object.fromEntries(
      build({
        gender: 'Female',
        residentialAddress: 'Riverside Drive 4, Nairobi, Kenya',
        phone: '+254 700 000 000',
        jobTitle: 'Software Engineer',
        organization: 'Example Bank Ltd',
      }).applicantRows.map((row) => [row.label, row.value]),
    )

    expect(rows['Gender']).toBe('Female')
    expect(rows['Residential address']).toBe(
      'Riverside Drive 4, Nairobi, Kenya',
    )
    expect(rows['Phone']).toBe('+254 700 000 000')
    expect(rows['Employment']).toBe('Software Engineer, Example Bank Ltd')
  })

  it('reads the applicant table in passport-data-page order', () => {
    const labels = build({
      gender: 'Male',
      passportExpiry: '2035-02-18',
      residentialAddress: 'Somewhere',
      phone: '+47 900 00 000',
      organization: 'Example Ltd',
    }).applicantRows.map((row) => row.label)

    expect(labels).toEqual([
      'Full name',
      'Date of birth',
      'Gender',
      'Nationality',
      'Passport number',
      'Passport valid until',
      'Residential address',
      'Phone',
      'Employment',
    ])
  })

  it('falls back to whichever half of the employment line exists', () => {
    const only = (overrides: Parameters<typeof build>[0]) =>
      build(overrides).applicantRows.find((row) => row.label === 'Employment')
        ?.value

    expect(only({ organization: 'Example Ltd' })).toBe('Example Ltd')
    expect(only({ jobTitle: 'Software Engineer' })).toBe('Software Engineer')
    expect(only({})).toBeUndefined()
  })

  it('omits optional rows that were not filled in', () => {
    const labels = build().applicantRows.map((row) => row.label)

    expect(labels).not.toContain('Passport valid until')
    expect(labels).not.toContain('Gender')
    expect(labels).not.toContain('Residential address')
    expect(labels).not.toContain('Phone')
    expect(labels).not.toContain('Employment')
  })

  it('describes a speaker differently from an attendee', () => {
    expect(build({ role: 'speaker' }).paragraphs[1]).toContain(
      'confirmed speaker',
    )
    expect(build().paragraphs[1]).toContain('as an attendee')
  })

  it('gets the article right for every role', () => {
    expect(build({ role: 'organizer' }).paragraphs[1]).toContain(
      'as an organizer',
    )
    expect(build({ role: 'sponsor' }).paragraphs[1]).toContain(
      'as a sponsor representative',
    )
    expect(build().paragraphs[1]).toContain('as an attendee')
  })

  it('states the intended stay when both dates are given', () => {
    const content = build({
      arrivalDate: '2026-11-03',
      departureDate: '2026-11-08',
    })

    expect(content.paragraphs[2]).toContain('from 3 November 2026')
    expect(content.paragraphs[2]).toContain('to 8 November 2026')
  })

  it('still promises departure when no stay dates are given', () => {
    expect(build().paragraphs[2]).toContain('expected to leave the country')
  })

  it('always closes with the disclaimer and the reference', () => {
    const content = build()
    const closing = content.paragraphs[content.paragraphs.length - 1]

    expect(closing).toContain('constitutes no commitment')
    expect(closing).toContain('CNDN-2026-INV-0007')
    expect(closing).toContain('chair@cloudnativedays.no')
  })

  it('appends organizer notes before the closing', () => {
    const content = build({ additionalNotes: 'Travelling with a colleague.' })

    expect(content.paragraphs[content.paragraphs.length - 2]).toBe(
      'Travelling with a colleague.',
    )
  })

  it('defaults the addressee when no consulate is named', () => {
    expect(build().addressedTo).toBe('To whom it may concern')
    expect(
      build({ addressedTo: 'The Embassy of Norway in Nairobi' }).addressedTo,
    ).toBe('The Embassy of Norway in Nairobi')
  })

  it('puts the event facts in the event table', () => {
    const rows = Object.fromEntries(
      build({ registrationReference: 'TICKET-8891' }).eventRows.map((row) => [
        row.label,
        row.value,
      ]),
    )

    expect(rows['Event']).toBe('Cloud Native Days Norway 2026')
    expect(rows['Venue']).toBe('Bergen Conference Center, Conference Way 10')
    expect(rows['Location']).toBe('Bergen, Norway')
    expect(rows['Participating as']).toBe('Attendee')
    expect(rows['Registration reference']).toBe('TICKET-8891')
  })
})

describe('organizer contact details', () => {
  it('puts the contact email and the website on the letterhead', () => {
    const lines = build().organizerLines

    // Appended, so the three lines letters already carry are untouched.
    expect(lines).toEqual([
      'Cloud Native Bergen',
      expect.stringMatching(/^Org\. no\. 933/),
      'Event Plaza 1, 5003 Bergen',
      'hello@cloudnativedays.no',
      'https://cloudnativedays.no',
    ])
  })

  it('closes up rather than leaving a blank line when a field is missing', () => {
    const bare = buildInvitationLetterContent({
      details,
      conference: {
        ...conference,
        contactEmail: undefined,
        domains: [],
      } as unknown as Conference,
      signatory: { name: 'Hans' },
      reference: 'INV-2026-AAAAAA',
      issuedAt: '2026-08-03T09:00:00Z',
    })

    expect(bare.organizerLines).toEqual([
      'Cloud Native Bergen',
      expect.stringMatching(/^Org\. no\. 933/),
      'Event Plaza 1, 5003 Bergen',
    ])
    expect(bare.organizerLines.every((line) => !!line.trim())).toBe(true)
  })
})

describe('the programme reference', () => {
  it('appends a link to the public programme, leaving the order alone', () => {
    const labels = build({
      registrationReference: 'TICKET-8891',
    }).eventRows.map((row) => row.label)

    expect(labels).toEqual([
      'Event',
      'Dates',
      'Venue',
      'Location',
      'Participating as',
      'Registration reference',
      'Programme',
    ])
  })

  it('builds the URL from the conference’s own domain', () => {
    expect(
      build().eventRows.find((row) => row.label === 'Programme')?.value,
    ).toBe('https://cloudnativedays.no/program')
  })

  it('omits the row when no domain resolves, rather than linking elsewhere', () => {
    for (const domains of [[], undefined, ['*.cloudnativedays.no'], ['']]) {
      const content = buildInvitationLetterContent({
        details,
        conference: { ...conference, domains } as unknown as Conference,
        signatory: { name: 'Hans' },
        reference: 'INV-2026-AAAAAA',
        issuedAt: '2026-08-03T09:00:00Z',
      })

      expect(
        content.eventRows.map((row) => row.label),
        `domains: ${JSON.stringify(domains)}`,
      ).not.toContain('Programme')
    }
  })
})

describe('confirmed programme sessions', () => {
  const withSessions = (sessions: ConfirmedSession[]) =>
    buildInvitationLetterContent({
      details: { ...details, role: 'speaker' },
      conference,
      signatory: { name: 'Hans' },
      reference: 'INV-2026-AAAAAA',
      issuedAt: '2026-08-03T09:00:00Z',
      sessions,
    })

  it('joins date, time and track into one line', () => {
    const content = withSessions([
      {
        title: 'Running Kubernetes on a Shoestring',
        date: '2026-11-05',
        startTime: '14:00',
        endTime: '14:45',
        track: 'Track 2',
      },
    ])

    expect(content.sessions).toEqual([
      {
        title: 'Running Kubernetes on a Shoestring',
        schedule: '5 November 2026 · 14:00–14:45 · Track 2',
      },
    ])
    expect(content.sessionsIntro).toContain('Amina Yusuf is confirmed')
  })

  it('leaves the schedule off an unscheduled talk entirely', () => {
    const content = withSessions([{ title: 'A Talk With No Slot' }])

    expect(content.sessions).toEqual([
      { title: 'A Talk With No Slot', schedule: undefined },
    ])
  })

  it.each([
    [{ date: '2026-11-05' }, '5 November 2026'],
    [{ track: 'Track 1' }, 'Track 1'],
    [{ startTime: '09:30' }, '09:30'],
    [{ endTime: '10:15' }, '10:15'],
    [{ date: '2026-11-05', track: 'Track 1' }, '5 November 2026 · Track 1'],
    [
      { startTime: '09:30', endTime: '10:15', track: 'Track 1' },
      '09:30–10:15 · Track 1',
    ],
  ])('never dangles a separator: %j', (parts, expected) => {
    const [session] = withSessions([{ title: 'T', ...parts }]).sessions

    expect(session.schedule).toBe(expected)
    // The real failure mode: a leading, trailing or doubled separator.
    expect(session.schedule).not.toMatch(/(^ ?·| ?·$|· *·)/)
  })

  it('drops a session with no usable title', () => {
    expect(
      withSessions([{ title: '   ' }, { title: 'Real' }]).sessions,
    ).toEqual([{ title: 'Real', schedule: undefined }])
  })

  it('says nothing about sessions when there are none', () => {
    const content = build()

    expect(content.sessions).toEqual([])
    expect(content.sessionsIntro).toBeUndefined()
  })

  it('leaves the applicant rows and the paragraph order untouched', () => {
    // Same inputs either side — only `sessions` differs.
    const plain = withSessions([])
    const withTalk = withSessions([{ title: 'A Talk' }])

    expect(withTalk.applicantRows).toEqual(plain.applicantRows)
    expect(withTalk.paragraphs).toEqual(plain.paragraphs)
  })
})
