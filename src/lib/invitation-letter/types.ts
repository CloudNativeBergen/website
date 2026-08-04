/** The capacity in which the applicant attends — printed in the letter. */
export type ParticipantRole = 'attendee' | 'speaker' | 'sponsor' | 'organizer'

export const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  attendee: 'attendee',
  speaker: 'speaker',
  sponsor: 'sponsor representative',
  organizer: 'organizer',
}

/** Who pays for what. Embassies read this line closely, so it is explicit. */
export interface CostCoverage {
  /** The organizer has waived or is covering the registration fee. */
  registrationFee: boolean
  /** The organizer reimburses travel (e.g. via speaker travel support). */
  travel: boolean
  /** The organizer books or reimburses accommodation. */
  accommodation: boolean
}

/**
 * Everything the organizer types in to produce one letter.
 *
 * These fields are **never persisted**. They arrive in the mutation, go into
 * the PDF, and are dropped when the request ends — see the `invitationLetter`
 * Sanity type for what is kept instead. Nothing in this shape may be logged.
 */
export interface InvitationLetterDetails {
  /** Exactly as written in the passport. */
  fullName: string
  dateOfBirth: string
  nationality: string
  passportNumber: string
  /** Optional but frequently requested by consulates. */
  passportExpiry?: string
  /**
   * As written in the passport. Free text rather than an enum: passports carry
   * M/F/X and spelled-out forms depending on the issuing country, and a letter
   * that contradicts the data page is worse than one that omits the field.
   */
  gender?: string
  /** Home address, which the visa application also states. */
  residentialAddress?: string
  phone?: string
  /** Where the letter is sent; also the email delivery address. */
  email?: string
  /** Employer or affiliation, printed when present. */
  organization?: string
  /** Position held, which speaks to the purpose of the visit. */
  jobTitle?: string
  role: ParticipantRole
  /** Ticket or registration reference, so the claim is checkable. */
  registrationReference?: string
  /** Intended stay — usually a little wider than the conference itself. */
  arrivalDate?: string
  departureDate?: string
  /** Addressee, e.g. "The Embassy of Norway in Nairobi". */
  addressedTo?: string
  costCoverage: CostCoverage
  /** Free text appended before the closing, for anything unusual. */
  additionalNotes?: string
}

/** The audit record kept after a letter is issued. Carries no passport data. */
export interface IssuedInvitationLetter {
  _id: string
  reference: string
  recipientName: string
  recipientEmail?: string
  participantRole: ParticipantRole
  issuedAt: string
  issuedBy?: { _id: string; name: string }
  emailedTo?: string
}

/** How the organizer wants the finished letter delivered. */
export type InvitationDelivery = 'download' | 'email' | 'both'
