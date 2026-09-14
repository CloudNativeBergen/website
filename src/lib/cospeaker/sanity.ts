import { groq } from 'next-sanity'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { CoSpeakerInvitationFull } from './types'

/**
 * Fetches the plain-text abstract for a proposal by id. The Portable Text
 * `description` field is flattened server-side via `pt::text()`.
 *
 * TENANT-SCOPED (S1, #616): the invitation email flow resolves the current
 * conference before building the email, and the invitation's proposal belongs
 * to it, so the read carries `conference._ref == $conferenceId` — a foreign or
 * unresolvable conference reads as a missing abstract (fail closed to the
 * placeholder).
 *
 * Returns null if the proposal is missing, the abstract is empty, or the
 * fetch fails — callers are expected to fall back to a placeholder.
 */
export async function getProposalAbstract(
  proposalId: string,
  conferenceId: string,
): Promise<string | null> {
  if (!conferenceId) return null

  const query = groq`*[
    _type == "talk" &&
    _id == $proposalId &&
    conference._ref == $conferenceId
  ][0] {
    "abstract": pt::text(description)
  }`

  try {
    const result = await clientRead.fetch<{ abstract?: string | null } | null>(
      query,
      { proposalId, conferenceId },
      { cache: 'no-store' },
    )
    const abstract = result?.abstract?.trim()
    return abstract || null
  } catch (error) {
    console.error('Error fetching proposal abstract:', error)
    return null
  }
}

const INVITATION_PROJECTION = `{
    _id,
    invitedEmail,
    invitedName,
    status,
    token,
    expiresAt,
    createdAt,
    respondedAt,
    declineReason,
    lastRemindedAt,
    _createdAt,
    _updatedAt,
    proposal-> { _id, title, format, status },
    invitedBy-> { _id, name, email },
    conference-> { _id }
  }`

/**
 * Point read of ONE invitation by its own document id, with the proposal and
 * inviter dereferenced (everything a reminder/renewal email needs, plus the
 * bearer token).
 *
 * NOT an authorization boundary. Callers must prove the id first —
 * `requireDocumentInCurrentOrg(id, 'coSpeakerInvitation')` — and then prove the
 * caller's access to the dereferenced proposal. See `invitation.remind` /
 * `invitation.resend`.
 */
export async function getInvitationById(
  id: string,
): Promise<CoSpeakerInvitationFull | null> {
  // groq-global-scoped: by-id point read of a document whose tenancy the CALLER
  // has already proven with `requireDocumentInCurrentOrg(id,
  // 'coSpeakerInvitation')` — that guard resolves `conference->organization._ref`
  // for this exact id and refuses before this read runs, so the id reaching here
  // is already bound to the request's org. Adding a `$orgIds` conjunct here
  // would re-derive the same fact, not a stronger one.
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    _id == $invitationId
  ][0] ${INVITATION_PROJECTION}`

  try {
    const invitation = await clientRead.fetch(
      query,
      { invitationId: id },
      { cache: 'no-store' },
    )
    return invitation || null
  } catch (error) {
    console.error('Error fetching invitation by id:', error)
    return null
  }
}

export async function getInvitationByToken(
  token: string,
): Promise<CoSpeakerInvitationFull | null> {
  // groq-global: capability-addressed point read — the unguessable single-use
  // invitation token IS the credential and resolves to exactly ONE document;
  // the public respond flow must find the invitation before any session or
  // tenant context exists to scope by.
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    token == $invitationToken
  ][0] ${INVITATION_PROJECTION}`

  try {
    const invitation = await clientRead.fetch(
      query,
      { invitationToken: token },
      { cache: 'no-store' },
    )
    return invitation || null
  } catch (error) {
    console.error('Error fetching invitation by token:', error)
    return null
  }
}
