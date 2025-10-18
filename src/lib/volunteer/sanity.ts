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
        contact_email,
        cfp_email,
        city,
        country,
        start_date,
        domains,
        organizer,
        social_links
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
        contact_email,
        cfp_email,
        city,
        country,
        start_date,
        domains,
        organizer,
        social_links
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

export async function getAllVolunteers(): Promise<{
  volunteers: VolunteerWithConference[]
  error: Error | null
}> {
  try {
    const query = `*[_type == "volunteer"] | order(_createdAt desc) {
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
        title
      },
      consent,
      status,
      submittedAt,
      reviewedAt,
      reviewedBy,
      reviewNotes
    }`

    const volunteers = await clientRead.fetch<VolunteerWithConference[]>(query)
    return { volunteers: volunteers || [], error: null }
  } catch (error) {
    return {
      volunteers: [],
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
