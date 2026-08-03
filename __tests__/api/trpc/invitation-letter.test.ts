/**
 * @vitest-environment node
 *
 * Locks the privacy contract of `invitationLetter.issue`: the applicant's
 * passport details go into the PDF and nowhere else. If a future change starts
 * persisting or logging them, these tests fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  recordInvitationLetter,
  listInvitationLetters,
} from '@/lib/invitation-letter/sanity'
import { generateInvitationLetterPdf } from '@/lib/invitation-letter/pdf'
import { sendInvitationLetterEmail } from '@/lib/email/invitation-letter'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/invitation-letter/sanity', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/invitation-letter/sanity')
  >('@/lib/invitation-letter/sanity')
  return {
    ...actual,
    recordInvitationLetter: vi.fn(),
    listInvitationLetters: vi.fn(),
  }
})
vi.mock('@/lib/invitation-letter/pdf')
vi.mock('@/lib/email/invitation-letter')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))

const organizer = {
  _id: 'organizer-1',
  name: 'Hans Kristian Flaatten',
  email: 'chair@test.com',
  isOrganizer: true,
  organizerOrgIds: ['org-test'],
}

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Bergen',
  organizerOrgNumber: '933338622',
  organizerAddress: 'Event Plaza 1, 5003 Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-11-05',
  endDate: '2026-11-06',
  contactEmail: 'hello@test.com',
  organization: { _type: 'reference', _ref: 'org-test' },
}

const PASSPORT_NUMBER = 'A1234567'

const validInput = {
  fullName: 'Amina Yusuf',
  dateOfBirth: '1990-04-12',
  nationality: 'Kenyan',
  passportNumber: PASSPORT_NUMBER,
  email: 'amina@example.com',
  role: 'attendee' as const,
  costCoverage: {
    registrationFee: false,
    travel: false,
    accommodation: false,
  },
  delivery: 'download' as const,
}

const createCaller = () =>
  appRouter.createCaller({
    session: { user: { email: organizer.email }, speaker: organizer },
    speaker: organizer,
    user: { email: organizer.email },
  } as unknown as Parameters<typeof appRouter.createCaller>[0])

const recordMock = recordInvitationLetter as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: conference as never,
    domain: 'test.com',
    error: null,
  })
  vi.mocked(generateInvitationLetterPdf).mockResolvedValue(
    Buffer.from('%PDF-1.7 fake'),
  )
  vi.mocked(recordInvitationLetter).mockResolvedValue({ id: 'letter-1' })
  vi.mocked(sendInvitationLetterEmail).mockResolvedValue({
    success: true,
    emailId: 'email-1',
  })
  vi.mocked(listInvitationLetters).mockResolvedValue({ letters: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('invitationLetter.issue — privacy contract', () => {
  it('never writes passport details to the audit record', async () => {
    await createCaller().invitationLetter.issue({
      ...validInput,
      passportExpiry: '2030-01-31',
    })

    const written = JSON.stringify(recordMock.mock.calls[0][0])
    expect(written).not.toContain(PASSPORT_NUMBER)
    expect(written).not.toContain('1990-04-12')
    expect(written).not.toContain('Kenyan')
  })

  it('keeps only the non-sensitive audit fields', () => {
    return createCaller()
      .invitationLetter.issue(validInput)
      .then(() => {
        expect(Object.keys(recordMock.mock.calls[0][0]).sort()).toEqual([
          'conferenceId',
          'emailedTo',
          'issuedAt',
          'issuedById',
          'participantRole',
          'recipientEmail',
          'recipientName',
          'reference',
        ])
      })
  })

  it('does not log the applicant details when the PDF fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(generateInvitationLetterPdf).mockRejectedValue(
      new Error('render blew up'),
    )

    await expect(
      createCaller().invitationLetter.issue(validInput),
    ).rejects.toThrow()

    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).not.toContain(PASSPORT_NUMBER)
    expect(logged).toContain('render blew up')
  })
})

describe('invitationLetter.issue — delivery', () => {
  it('returns the PDF and a quotable reference', async () => {
    const result = await createCaller().invitationLetter.issue(validInput)

    expect(result.reference).toMatch(/^INV-\d{4}-[A-Z2-9]{6}$/)
    expect(Buffer.from(result.pdfBase64, 'base64').toString()).toContain('%PDF')
    expect(result.filename).toContain('amina-yusuf')
    expect(result.filename.endsWith('.pdf')).toBe(true)
  })

  it('does not email when delivery is download only', async () => {
    await createCaller().invitationLetter.issue(validInput)

    expect(sendInvitationLetterEmail).not.toHaveBeenCalled()
    expect(recordMock.mock.calls[0][0].emailedTo).toBeUndefined()
  })

  it('emails the applicant and records it when asked to', async () => {
    const result = await createCaller().invitationLetter.issue({
      ...validInput,
      delivery: 'both',
    })

    expect(sendInvitationLetterEmail).toHaveBeenCalledOnce()
    expect(result.emailedTo).toBe('amina@example.com')
    expect(recordMock.mock.calls[0][0].emailedTo).toBe('amina@example.com')
  })

  it('still returns the letter when the email fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendInvitationLetterEmail).mockResolvedValue({
      success: false,
      error: 'mailbox full',
    })

    const result = await createCaller().invitationLetter.issue({
      ...validInput,
      delivery: 'email',
    })

    expect(result.pdfBase64).toBeTruthy()
    expect(result.emailError).toBe('mailbox full')
    expect(result.emailedTo).toBeUndefined()
  })

  it('still returns the letter when the audit write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(recordInvitationLetter).mockResolvedValue({
      error: new Error('sanity down'),
    })

    const result = await createCaller().invitationLetter.issue(validInput)

    expect(result.pdfBase64).toBeTruthy()
    expect(result.auditRecorded).toBe(false)
  })
})

describe('invitationLetter.issue — validation', () => {
  it('rejects a departure before arrival', async () => {
    await expect(
      createCaller().invitationLetter.issue({
        ...validInput,
        arrivalDate: '2026-11-08',
        departureDate: '2026-11-03',
      }),
    ).rejects.toThrow(/Departure cannot be before arrival/)
  })

  it('rejects email delivery without an address', async () => {
    await expect(
      createCaller().invitationLetter.issue({
        ...validInput,
        email: undefined,
        delivery: 'both',
      }),
    ).rejects.toThrow(/email address is required/)
  })

  it('refuses to issue when the conference names no legal entity', async () => {
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: { ...conference, organizer: '  ' } as never,
      domain: 'test.com',
      error: null,
    })

    await expect(
      createCaller().invitationLetter.issue(validInput),
    ).rejects.toThrow(/no organizer name/)
  })
})
