import { formatDateLocalized, formatDateRangeLocalized } from '@/lib/time'
import { formatOrgNumber } from '@/lib/format'
import type { Conference } from '@/lib/conference/types'
import {
  PARTICIPANT_ROLE_LABELS,
  type CostCoverage,
  type InvitationLetterDetails,
} from './types'

/** Letters go to consulates worldwide, so they are written in English. */
const LETTER_LOCALE = 'en-GB'

export interface InvitationLetterSignatory {
  name: string
  title?: string
  email?: string
  /** Data URL of a handwritten signature, if the organizer has one stored. */
  signatureDataUrl?: string
}

export interface InvitationLetterContent {
  reference: string
  issuedOn: string
  addressedTo: string
  subject: string
  /** Organizer letterhead lines, already formatted, blanks removed. */
  organizerLines: string[]
  /** Label/value pairs rendered as the applicant table. */
  applicantRows: Array<{ label: string; value: string }>
  /** Label/value pairs rendered as the event table. */
  eventRows: Array<{ label: string; value: string }>
  /** Body paragraphs in order. */
  paragraphs: string[]
  signatory: InvitationLetterSignatory
}

function formatDate(value?: string): string | undefined {
  return value ? formatDateLocalized(value, LETTER_LOCALE) : undefined
}

/**
 * The cost sentence, spelled out in both directions.
 *
 * Consulates read this line more carefully than any other, and an omission is
 * read as a claim: saying nothing about accommodation invites the assumption
 * that the organizer covers it. So both what is and what is not covered are
 * stated explicitly, every time.
 */
export function costCoverageSentence(coverage: CostCoverage): string {
  const items: Array<[keyof CostCoverage, string]> = [
    ['registrationFee', 'the conference registration fee'],
    ['travel', 'travel costs'],
    ['accommodation', 'accommodation'],
  ]

  const covered = items
    .filter(([key]) => coverage[key])
    .map(([, label]) => label)
  const notCovered = items
    .filter(([key]) => !coverage[key])
    .map(([, label]) => label)

  if (covered.length === 0) {
    return 'All costs related to this visit — including the conference registration fee, travel costs and accommodation — are borne by the applicant. The organizer accepts no financial responsibility for this visit.'
  }

  const coveredSentence = `The organizer covers ${joinList(covered)} for the applicant.`

  if (notCovered.length === 0) {
    return `${coveredSentence} No further financial commitment is made beyond what is stated here.`
  }

  return `${coveredSentence} ${capitalize(joinList(notCovered))} ${
    notCovered.length === 1 ? 'is' : 'are'
  } borne by the applicant.`
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** English article for a role label — "an attendee", "an organizer", "a speaker". */
function indefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Builds the full letter from the organizer's input and the conference record.
 *
 * Pure and fully testable: the PDF renderer only lays this out, so the wording
 * that a consulate reads is covered by unit tests rather than buried in JSX.
 */
export function buildInvitationLetterContent({
  details,
  conference,
  signatory,
  reference,
  issuedAt,
}: {
  details: InvitationLetterDetails
  conference: Conference
  signatory: InvitationLetterSignatory
  reference: string
  issuedAt: string
}): InvitationLetterContent {
  const roleLabel = PARTICIPANT_ROLE_LABELS[details.role]
  const eventDates = formatDateRangeLocalized(
    conference.startDate,
    conference.endDate,
    LETTER_LOCALE,
  )
  const venue = [conference.venueName, conference.venueAddress]
    .filter(Boolean)
    .join(', ')
  const location = [conference.city, conference.country]
    .filter(Boolean)
    .join(', ')

  const organizerLines = [
    conference.organizer,
    conference.organizerOrgNumber
      ? `Org. no. ${formatOrgNumber(conference.organizerOrgNumber)}`
      : undefined,
    conference.organizerAddress,
  ].filter((line): line is string => !!line?.trim())

  // Ordered like a passport data page, then contact, then employment — the
  // sequence a consular officer reads when checking the letter against the
  // application.
  const employment = [details.jobTitle, details.organization]
    .filter((part) => !!part?.trim())
    .join(', ')

  const applicantRows = [
    { label: 'Full name', value: details.fullName },
    { label: 'Date of birth', value: formatDate(details.dateOfBirth) ?? '' },
    details.gender ? { label: 'Gender', value: details.gender } : undefined,
    { label: 'Nationality', value: details.nationality },
    { label: 'Passport number', value: details.passportNumber },
    details.passportExpiry
      ? {
          label: 'Passport valid until',
          value: formatDate(details.passportExpiry) ?? '',
        }
      : undefined,
    details.residentialAddress
      ? { label: 'Residential address', value: details.residentialAddress }
      : undefined,
    details.phone ? { label: 'Phone', value: details.phone } : undefined,
    employment ? { label: 'Employment', value: employment } : undefined,
  ].filter((row): row is { label: string; value: string } => !!row)

  const eventRows = [
    { label: 'Event', value: conference.title },
    { label: 'Dates', value: eventDates },
    venue ? { label: 'Venue', value: venue } : undefined,
    location ? { label: 'Location', value: location } : undefined,
    { label: 'Participating as', value: capitalize(roleLabel) },
    details.registrationReference
      ? {
          label: 'Registration reference',
          value: details.registrationReference,
        }
      : undefined,
  ].filter((row): row is { label: string; value: string } => !!row)

  const paragraphs: string[] = [
    `On behalf of ${conference.organizer}, I confirm that ${details.fullName} is invited to attend ${conference.title}, taking place ${eventDates}${
      location ? ` in ${location}` : ''
    }.`,
  ]

  paragraphs.push(
    details.role === 'speaker'
      ? `${details.fullName} is participating as a confirmed speaker and will present as part of the conference programme.`
      : `${details.fullName} is participating as ${indefiniteArticle(
          roleLabel,
        )} ${roleLabel} at the conference.`,
  )

  const arrival = formatDate(details.arrivalDate)
  const departure = formatDate(details.departureDate)
  if (arrival && departure) {
    paragraphs.push(
      `The intended period of stay is from ${arrival} to ${departure}. ${details.fullName} is expected to leave the country upon conclusion of the visit.`,
    )
  } else {
    paragraphs.push(
      `${details.fullName} is expected to leave the country upon conclusion of the visit.`,
    )
  }

  paragraphs.push(costCoverageSentence(details.costCoverage))

  if (details.additionalNotes?.trim()) {
    paragraphs.push(details.additionalNotes.trim())
  }

  paragraphs.push(
    `This letter is issued solely to support a visa application and constitutes no commitment beyond what is stated above. Should you require verification, please contact ${
      signatory.email ?? conference.contactEmail ?? conference.organizer
    }, quoting reference ${reference}.`,
  )

  return {
    reference,
    issuedOn: formatDateLocalized(issuedAt, LETTER_LOCALE),
    addressedTo: details.addressedTo?.trim() || 'To whom it may concern',
    subject: `Letter of invitation — ${conference.title} (${eventDates})`,
    organizerLines,
    applicantRows,
    eventRows,
    paragraphs,
    signatory,
  }
}
