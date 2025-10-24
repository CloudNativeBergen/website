import { groq } from 'next-sanity'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { CoSpeakerInvitationFull } from './types'

export async function getInvitationByToken(
  token: string,
): Promise<CoSpeakerInvitationFull | null> {
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
    proposal-> { _id, title },
    invitedBy-> { _id, name, email }
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
