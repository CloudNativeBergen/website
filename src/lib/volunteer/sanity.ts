import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import {
  Volunteer,
  VolunteerInput,
  VolunteerStatus,
  VolunteerWithConference,
} from './types'

export async function getVolunteersByConference(
  conferenceId: string,
): Promise<{ volunteers: VolunteerWithConference[]; error: Error | null }> {
  try {
    const query = `*[_type == "volunteer" && conference._ref == $conferenceId] | order(_createdAt desc) {
      _id,
      _rev,
      _createdAt,
      _updatedAt,
      name,
      email,
      phone,
      occupation,
      availability,
      preferredTasks,
      tshirtSize,
      dietaryRestrictions,
      otherInfo,
      conference->{
        _id,
        title,
        contactEmail,
        cfpEmail,
        city,
        country,
        startDate,
        domains,
        organizer,
        socialLinks
      },
      consent,
      status,
      submittedAt,
      reviewedAt,
      reviewedBy->{
        _id,
        name
      },
      reviewNotes
    }`

    const volunteers = await clientRead.fetch<VolunteerWithConference[]>(
      query,
      {
        conferenceId,
      },
    )
    return { volunteers: volunteers || [], error: null }
  } catch (error) {
    return {
      volunteers: [],
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}

export async function getVolunteerById(
  id: string,
): Promise<{ volunteer: VolunteerWithConference | null; error: Error | null }> {
  try {
    const query = `*[_type == "volunteer" && _id == $id][0] {
      _id,
      _rev,
      _createdAt,
      _updatedAt,
      name,
      email,
      phone,
      occupation,
      availability,
      preferredTasks,
      tshirtSize,
      dietaryRestrictions,
      otherInfo,
      conference->{
        _id,
        title,
        contactEmail,
        cfpEmail,
        city,
        country,
        startDate,
        domains,
        organizer,
        socialLinks
      },
      consent,
      status,
      submittedAt,
      reviewedAt,
      reviewedBy->{
        _id,
        name
      },
      reviewNotes
    }`

    const volunteer = await clientRead.fetch<VolunteerWithConference | null>(
      query,
      { id },
    )
    return { volunteer, error: null }
  } catch (error) {
    return {
      volunteer: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}

export async function createVolunteer(
  data: VolunteerInput,
): Promise<{ volunteer: Volunteer | null; error: Error | null }> {
  try {
    const document = {
      _type: 'volunteer',
      ...data,
      status: VolunteerStatus.PENDING,
      submittedAt: new Date().toISOString(),
    }

    const volunteer = (await clientWrite.create(document)) as Volunteer
    return { volunteer, error: null }
  } catch (error) {
    return {
      volunteer: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}

export async function updateVolunteerStatus(
  volunteerId: string,
  status: VolunteerStatus,
  reviewedBy: string,
  reviewNotes?: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const updates: Record<string, unknown> = {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: {
        _type: 'reference',
        _ref: reviewedBy,
      },
    }

    if (reviewNotes) {
      updates.reviewNotes = reviewNotes
    }

    await clientWrite.patch(volunteerId).set(updates).commit()
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}

/** The organizer-editable subset of a volunteer's detail fields (SE-4). */
export interface VolunteerDetailsUpdate {
  name: string
  email: string
  phone: string
  occupation: string
  availability?: string | null
  preferredTasks?: string[] | null
  tshirtSize?: string | null
  dietaryRestrictions?: string | null
  otherInfo?: string | null
}

/**
 * Patch a volunteer's own detail fields (SE-4). Required fields are always set;
 * nullable optional fields are UNSET when explicitly `null` and left untouched
 * when absent (a `.set(null)` would be ignored by Sanity, stranding stale
 * values). Never touches status/review provenance.
 */
export async function updateVolunteerDetails(
  volunteerId: string,
  data: VolunteerDetailsUpdate,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const set: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      occupation: data.occupation,
    }
    const unset: string[] = []

    const optional: Array<keyof VolunteerDetailsUpdate> = [
      'availability',
      'preferredTasks',
      'tshirtSize',
      'dietaryRestrictions',
      'otherInfo',
    ]
    for (const key of optional) {
      const value = data[key]
      if (value === null) unset.push(key)
      else if (value !== undefined) set[key] = value
    }

    let patch = clientWrite.patch(volunteerId).set(set)
    if (unset.length > 0) patch = patch.unset(unset)
    await patch.commit()

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}

export async function deleteVolunteer(
  volunteerId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await clientWrite.delete(volunteerId)
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}
