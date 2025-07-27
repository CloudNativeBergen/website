import { ContactPerson, SponsorWithContactInfo } from './types'
import { Contact, syncSponsorAudience } from '@/lib/email/audience'
import { Conference } from '@/lib/conference/types'

/**
 * Extract email contacts from sponsor contact persons
 */
export function extractSponsorContacts(
  sponsor: SponsorWithContactInfo,
): Contact[] {
  if (!sponsor.contact_persons) {
    return []
  }

  return sponsor.contact_persons
    .filter((contact) => contact.email) // Only include contacts with email
    .map((contact) => ({
      email: contact.email,
      firstName: contact.name.split(' ')[0] || '',
      lastName: contact.name.split(' ').slice(1).join(' ') || '',
      organization: sponsor.name,
    }))
}

/**
 * Compare old and new contact lists to determine what changed
 */
export function diffSponsorContacts(
  oldContacts: ContactPerson[] | undefined,
  newContacts: ContactPerson[] | undefined,
): {
  added: ContactPerson[]
  removed: ContactPerson[]
  unchanged: ContactPerson[]
} {
  const oldEmails = new Set((oldContacts || []).map((c) => c.email))
  const newEmails = new Set((newContacts || []).map((c) => c.email))

  const added = (newContacts || []).filter((c) => !oldEmails.has(c.email))
  const removed = (oldContacts || []).filter((c) => !newEmails.has(c.email))
  const unchanged = (newContacts || []).filter((c) => oldEmails.has(c.email))

  return { added, removed, unchanged }
}

/**
 * Update sponsor audience when contacts change
 */
export async function updateSponsorAudience(
  conference: Conference,
  oldSponsor: SponsorWithContactInfo | null,
  newSponsor: SponsorWithContactInfo,
): Promise<{
  success: boolean
  addedCount: number
  removedCount: number
  error?: Error
}> {
  try {
    // Extract contacts from both old and new sponsor data
    const newContacts = extractSponsorContacts(newSponsor)

    // Get all current sponsor contacts for the conference
    // We need to do a full sync to ensure consistency across all sponsors
    const allSponsorContacts = await getAllConferenceSponsorContacts(conference)

    // Update the contacts for this specific sponsor
    const updatedAllContacts = allSponsorContacts.filter(
      (contact) => contact.organization !== newSponsor.name,
    )
    updatedAllContacts.push(...newContacts)

    // Sync the entire sponsor audience
    const result = await syncSponsorAudience(conference, updatedAllContacts)

    return {
      success: result.success,
      addedCount: result.addedCount,
      removedCount: result.removedCount,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to update sponsor audience:', error)
    return {
      success: false,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}

/**
 * Get all sponsor contacts for a conference
 * This queries all sponsors associated with the conference
 */
async function getAllConferenceSponsorContacts(
  conference: Conference,
): Promise<Contact[]> {
  try {
    // Import here to avoid circular dependencies
    const { clientWrite } = await import('@/lib/sanity/client')

    // Query all sponsors for this conference with their contact information
    const sponsors = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0].sponsors[]{
        sponsor->{
          _id,
          name,
          contact_persons[]{
            _key,
            name,
            email,
            phone,
            role
          }
        }
      }`,
      { conferenceId: conference._id },
    )

    const allContacts: Contact[] = []

    // Extract contacts from all sponsors
    for (const sponsorRef of sponsors || []) {
      if (sponsorRef.sponsor && sponsorRef.sponsor.contact_persons) {
        const sponsorContacts = sponsorRef.sponsor.contact_persons
          .filter((contact: ContactPerson) => contact.email)
          .map((contact: ContactPerson) => ({
            email: contact.email,
            firstName: contact.name.split(' ')[0] || '',
            lastName: contact.name.split(' ').slice(1).join(' ') || '',
            organization: sponsorRef.sponsor.name,
          }))

        allContacts.push(...sponsorContacts)
      }
    }

    return allContacts
  } catch (error) {
    console.error('Failed to get conference sponsor contacts:', error)
    return []
  }
}
