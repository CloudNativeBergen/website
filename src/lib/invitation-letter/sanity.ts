import { customAlphabet } from 'nanoid'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import type { IssuedInvitationLetter, ParticipantRole } from './types'

// Unambiguous alphabet: no O/0 or I/1, because this reference gets read aloud
// and retyped by consulate staff from a printed page.
const referenceSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

/** Filesystem-safe letter filename, e.g. `invitation-letter-inv-2026-k7m2qp.pdf`. */
export function invitationLetterFilename(
  reference: string,
  recipientName: string,
): string {
  const slug = recipientName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `invitation-letter-${reference.toLowerCase()}${slug ? `-${slug}` : ''}.pdf`
}

/**
 * A quotable, collision-free reference. Deliberately random rather than
 * sequential: a running number would need a count-then-write, which races when
 * two organizers issue letters at the same moment and would hand out the same
 * reference to two applicants.
 */
export function generateLetterReference(issuedAt: string): string {
  return `INV-${issuedAt.slice(0, 4)}-${referenceSuffix()}`
}

const LETTER_FIELDS = `
  _id,
  reference,
  recipientName,
  recipientEmail,
  participantRole,
  issuedAt,
  emailedTo,
  issuedBy->{ _id, name }
`

/**
 * Records that a letter was issued.
 *
 * Takes only non-sensitive fields by construction: there is no parameter here
 * for a passport number, date of birth or nationality, so no future caller can
 * accidentally start persisting them.
 */
export async function recordInvitationLetter(params: {
  conferenceId: string
  reference: string
  recipientName: string
  recipientEmail?: string
  participantRole: ParticipantRole
  issuedById?: string
  issuedAt: string
  emailedTo?: string
}): Promise<{ id?: string; error?: Error }> {
  try {
    const created = await clientWrite.create({
      _type: 'invitationLetter',
      conference: { _type: 'reference', _ref: params.conferenceId },
      reference: params.reference,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      participantRole: params.participantRole,
      issuedBy: params.issuedById
        ? { _type: 'reference', _ref: params.issuedById }
        : undefined,
      issuedAt: params.issuedAt,
      emailedTo: params.emailedTo,
    })

    return { id: created._id }
  } catch (error) {
    return { error: error as Error }
  }
}

/** The issue log for one conference, newest first. */
export async function listInvitationLetters(
  conferenceId: string,
  limit = 100,
): Promise<{ letters?: IssuedInvitationLetter[]; error?: Error }> {
  try {
    const letters = await clientRead.fetch<IssuedInvitationLetter[]>(
      `*[_type == "invitationLetter" && conference._ref == $conferenceId]
        | order(issuedAt desc)[0...$limit]{${LETTER_FIELDS}}`,
      { conferenceId, limit },
    )

    return { letters }
  } catch (error) {
    return { error: error as Error }
  }
}
