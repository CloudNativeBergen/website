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
  ][0] {
    _id,
    invitedEmail,
    invitedName,
    status,
    token,
    expiresAt,
    createdAt,
    _createdAt,
    _updatedAt,
    proposal-> { _id, title, format, status },
    invitedBy-> { _id, name, email },
    conference-> { _id }
  }`

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
