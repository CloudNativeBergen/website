import { ContactPerson, SponsorWithContactInfo } from './types'
import {
  Contact,
  getOrCreateConferenceAudienceByType,
  addContactToAudience,
  removeContactFromAudience,
} from '@/lib/email/audience'
import { Conference } from '@/lib/conference/types'
import { delay, EMAIL_CONFIG } from '@/lib/email/config'

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
    const oldContactsWithPerson = oldSponsor?.contact_persons || []
    const newContactsWithPerson = newSponsor.contact_persons || []
    const { added, removed } = diffSponsorContacts(
      oldContactsWithPerson,
      newContactsWithPerson,
    )

    if (added.length === 0 && removed.length === 0) {
      return {
        success: true,
        addedCount: 0,
        removedCount: 0,
      }
    }

    return await updateSponsorAudienceIncremental(
      conference,
      added,
      removed,
      newSponsor.name,
    )
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

async function updateSponsorAudienceIncremental(
  conference: Conference,
  addedContacts: ContactPerson[],
  removedContacts: ContactPerson[],
  sponsorName: string,
): Promise<{
  success: boolean
  addedCount: number
  removedCount: number
  error?: Error
}> {
  try {
    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudienceByType(conference, 'sponsors')

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get sponsor audience ID')
    }

    let addedCount = 0
    let removedCount = 0

    for (const contact of addedContacts) {
      if (contact.email) {
        const contactToAdd: Contact = {
          email: contact.email,
          firstName: contact.name.split(' ')[0] || '',
          lastName: contact.name.split(' ').slice(1).join(' ') || '',
          organization: sponsorName,
        }

        const { success } = await addContactToAudience(audienceId, contactToAdd)
        if (success) {
          addedCount++
        }

        if (addedContacts.length > 1) {
          await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
        }
      }
    }

    for (const contact of removedContacts) {
      if (contact.email) {
        const { success } = await removeContactFromAudience(
          audienceId,
          contact.email,
        )
        if (success) {
          removedCount++
        }

        if (removedContacts.length > 1) {
          await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
        }
      }
    }

    return {
      success: true,
      addedCount,
      removedCount,
    }
  } catch (error) {
    console.error('Failed to perform sponsor audience update:', error)
    return {
      success: false,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}
