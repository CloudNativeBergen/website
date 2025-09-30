import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import type { WorkshopWithCapacity, WorkshopSignupInput, WorkshopSignupExisting } from './types'

const workshopSignupLocks = new Map<string, Promise<WorkshopSignupExisting>>()

export async function getAvailableWorkshops(
  conferenceId: string,
  includeCapacity = true
): Promise<WorkshopWithCapacity[]> {
  const query = groq`
    *[_type == "talk" && conference._ref == $conferenceId && format in ["workshop_120", "workshop_240"] && status == "confirmed"] | order(title asc) {
      _id,
      title,
      description,
      format,
      topics[]-> { _id, title, color },
      "capacity": coalesce(workshopCapacity, 30),
      "speakers": speakers[]->{
        _id,
        name,
        "slug": slug.current,
        bio,
        "image": image.asset->url,
        company
      },
      "signupCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"]),
      "waitlistCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "waitlist"]),
      "allSchedules": *[_type == "schedule"]{
        date,
        tracks[]{
          trackTitle,
          talks[]{
            startTime,
            endTime,
            "talkRef": talk._ref
          }
        }
      }
    }
  `

  const workshops = await clientWrite.fetch(query, { conferenceId })

  return workshops.map((workshop: WorkshopWithCapacity & { signupCount: number; waitlistCount: number; allSchedules?: any[] }) => {
    let date, startTime, endTime, room;

    if (workshop.allSchedules && workshop.allSchedules.length > 0) {
      for (const schedule of workshop.allSchedules) {
        let found = false;

        if (schedule.tracks) {
          for (const track of schedule.tracks) {
            if (track.talks) {
              const workshopTalk = track.talks.find((talk: any) =>
                talk.talkRef === workshop._id
              );

              if (workshopTalk) {
                date = schedule.date;
                startTime = workshopTalk.startTime;
                endTime = workshopTalk.endTime;
                room = track.trackTitle;
                found = true;
                break;
              }
            }
          }
        }

        if (found) break;
      }
    }

    const scheduleInfo = date && startTime && endTime ? {
      date,
      timeSlot: { startTime, endTime },
      room
    } : undefined;

    return {
      ...workshop,
      availableSlots: workshop.capacity - workshop.signupCount,
      available: workshop.capacity - workshop.signupCount,
      signups: workshop.signupCount,
      waitlistCount: workshop.waitlistCount,
      isFull: workshop.signupCount >= workshop.capacity,
      date,
      startTime,
      endTime,
      room,
      scheduleInfo,
      allSchedules: undefined
    }
  })
}

export async function getWorkshopSignups(
  userWorkOSId: string,
  conferenceId: string,
  status?: string
): Promise<WorkshopSignupExisting[]> {
  const statusFilter = status
    ? ` && status == "${status}"`
    : ` && (status == "confirmed" || status == "waitlist")`
  const query = groq`
    *[_type == "workshopSignup" && userWorkOSId == $userWorkOSId && conference._ref == $conferenceId${statusFilter}] {
      _id,
      _createdAt,
      userWorkOSId,
      userEmail,
      userName,
      status,
      "workshopId": workshop._ref,
      "workshop": workshop->{
        _id,
        title,
        format,
        description,
        "speaker": speaker->{
          name,
          "slug": slug.current,
          organization
        }
      }
    }
  `

  return clientWrite.fetch(query, { userWorkOSId, conferenceId })
}

/**
 * Check if a workshop has available capacity
 * @param workshopId The ID of the workshop
 * @returns Object with capacity information
 */
export async function checkWorkshopCapacity(workshopId: string): Promise<{
  totalCapacity: number
  confirmedSignups: number
  availableSpots: number
  capacity: number
  signups: number
  available: number
}> {
  const query = groq`
    *[_type == "talk" && _id == $workshopId][0] {
      "capacity": coalesce(workshopCapacity, 30),
      "signupCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"])
    }
  `

  const result = await clientWrite.fetch(query, { workshopId })

  if (!result) {
    return {
      totalCapacity: 0,
      confirmedSignups: 0,
      availableSpots: 0,
      capacity: 0,
      signups: 0,
      available: 0
    }
  }

  const available = result.capacity - result.signupCount

  return {
    totalCapacity: result.capacity,
    confirmedSignups: result.signupCount,
    availableSpots: available,
    capacity: result.capacity,
    signups: result.signupCount,
    available: available
  }
}

/**
 * Create a new workshop signup
 * @param signupData The signup data
 * @returns The created workshop signup document
 */
export async function createWorkshopSignup(signupData: WorkshopSignupInput): Promise<WorkshopSignupExisting> {
  const workshopId = signupData.workshop._ref

  // Ensure we have only one signup operation per workshop at a time
  const existingLock = workshopSignupLocks.get(workshopId)

  if (existingLock) {
    // Wait for the existing operation to complete, then retry
    await existingLock
  }

  // Create a new lock for this workshop
  const lockPromise = (async () => {
    try {
      // Check for existing signup
      const existingSignup = await clientWrite.fetch(
        groq`*[_type == "workshopSignup" && userWorkOSId == $userWorkOSId && workshop._ref == $workshopId && (status == "confirmed" || status == "waitlist")][0]`,
        { userWorkOSId: signupData.userWorkOSId, workshopId }
      )

      if (existingSignup) {
        throw new Error('User is already signed up for this workshop')
      }

      // Determine status - use provided status or check capacity
      let signupStatus: 'confirmed' | 'waitlist' = 'confirmed'
      if ((signupData as any).status) {
        signupStatus = (signupData as any).status
      } else {
        // Re-check capacity inside the lock
        const capacityInfo = await checkWorkshopCapacity(workshopId)
        if (capacityInfo.available <= 0) {
          signupStatus = 'waitlist'
        }
      }

      // Use Sanity transaction to ensure atomic operation
      const tx = clientWrite.transaction()

      const document = {
        _type: 'workshopSignup' as const,
        userWorkOSId: signupData.userWorkOSId,
        userEmail: signupData.userEmail,
        userName: signupData.userName,
        workshop: signupData.workshop,
        conference: signupData.conference,
        status: signupStatus,
        signupDate: new Date().toISOString(),
        confirmationEmailSent: false,
      }

      tx.create(document)
      const result = await tx.commit()

      const createdId = result.documentIds[0]

      // Fetch the full signup with populated workshop data
      const fullSignup = await clientWrite.fetch<WorkshopSignupExisting>(
        groq`*[_type == "workshopSignup" && _id == $id][0]{
          _id,
          _type,
          userEmail,
          userName,
          userWorkOSId,
          workshop->{_id, _ref, title, date, startTime, endTime, capacity},
          conference->{_id, _ref, name},
          status,
          signupDate,
          _createdAt,
          _updatedAt
        }`,
        { id: createdId }
      )

      return fullSignup
    } finally {
      // Clean up the lock after a short delay to handle rapid sequential requests
      setTimeout(() => {
        workshopSignupLocks.delete(workshopId)
      }, 100)
    }
  })()

  workshopSignupLocks.set(workshopId, lockPromise)

  return lockPromise
}

/**
 * Verify that a workshop belongs to a specific conference
 * @param workshopId The ID of the workshop
 * @param conferenceId The ID of the conference
 * @returns True if workshop belongs to conference, false otherwise
 */
export async function verifyWorkshopBelongsToConference(
  workshopId: string,
  conferenceId: string
): Promise<boolean> {
  const query = groq`
    *[_type == "talk" && _id == $workshopId && conference._ref == $conferenceId][0]
  `

  const result = await clientWrite.fetch(query, { workshopId, conferenceId })
  return !!result
}

/**
 * Cancel a workshop signup (set status to cancelled)
 * @param signupId The ID of the signup to cancel
 * @param reason The reason for cancellation
 * @returns The updated signup document
 */
export async function cancelWorkshopSignup(
  signupId: string,
  reason: string
): Promise<WorkshopSignupExisting> {
  return clientWrite
    .patch(signupId)
    .set({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason
    })
    .commit()
}

/**
 * Delete a workshop signup (admin only)
 * @param signupId The ID of the signup to delete
 * @returns Promise that resolves when deleted
 */
export async function deleteWorkshopSignup(signupId: string): Promise<void> {
  await clientWrite.delete(signupId)
}

/**
 * Get a single workshop by ID with capacity information
 * @param workshopId The ID of the workshop
 * @returns The workshop with capacity data or null
 */
export async function getWorkshopById(workshopId: string): Promise<WorkshopWithCapacity | null> {
  const query = groq`
    *[_type == "talk" && _id == $workshopId][0] {
      _id,
      title,
      description,
      "duration": select(
        format == "workshop_120" => 120,
        format == "workshop_240" => 240,
        120
      ),
      "capacity": coalesce(workshopCapacity, 30),
      "speaker": speakers[0]->{
        _id,
        name,
        "slug": slug.current,
        bio,
        "avatar": image.asset->url,
        company
      },
      "signupCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"])
    }
  `

  return clientWrite.fetch(query, { workshopId })
}

/**
 * Update workshop signup email status
 * @param signupId The ID of the signup to update
 * @param emailSent Whether the confirmation email was sent
 * @returns The updated signup document
 */
export async function updateWorkshopSignupEmailStatus(
  signupId: string,
  emailSent: boolean
): Promise<WorkshopSignupExisting> {
  return clientWrite.patch(signupId).set({ confirmationEmailSent: emailSent }).commit()
}

/**
 * Confirm a workshop signup
 * @param signupId The ID of the signup to confirm
 * @returns The updated signup document
 */
export async function confirmWorkshopSignup(signupId: string): Promise<WorkshopSignupExisting> {
  const signup = await clientWrite.fetch<WorkshopSignupExisting>(
    groq`*[_type == "workshopSignup" && _id == $signupId][0]{
      _id,
      _type,
      userEmail,
      userName,
      userWorkOSId,
      workshop->{
        _id,
        title,
        date,
        startTime,
        endTime,
        capacity
      },
      conference->{
        _id,
        name
      },
      status,
      signupDate,
      _createdAt,
      _updatedAt
    }`,
    { signupId }
  )

  if (!signup) {
    throw new Error('Signup not found')
  }

  const updated = await clientWrite
    .patch(signupId)
    .set({
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    })
    .commit()

  return {
    ...signup,
    status: 'confirmed'
  }
}

/**
 * Update workshop capacity
 * @param workshopId The ID of the workshop
 * @param capacity The new capacity
 * @returns The updated workshop
 */
export async function updateWorkshopCapacity(
  workshopId: string,
  capacity: number
): Promise<WorkshopWithCapacity> {
  const workshop = await clientWrite
    .patch(workshopId)
    .set({ workshopCapacity: capacity })
    .commit()

  const updatedWorkshop = await getWorkshopById(workshopId)
  if (!updatedWorkshop) {
    throw new Error('Workshop not found after update')
  }

  return updatedWorkshop
}

/**
 * Get workshop signups by workshop ID
 * @param workshopId The ID of the workshop
 * @param status Optional status filter
 * @param includeUserDetails Whether to include full user details
 * @returns Array of workshop signups
 */
export async function getWorkshopSignupsByWorkshop(
  workshopId: string,
  status?: string,
  includeUserDetails = true
): Promise<WorkshopSignupExisting[]> {
  const statusFilter = status ? `&& status == "${status}"` : ''

  const query = groq`*[_type == "workshopSignup" && workshop._ref == $workshopId ${statusFilter}] | order(signupDate desc) {
    _id,
    _type,
    userEmail,
    userName,
    userWorkOSId,
    experienceLevel,
    operatingSystem,
    workshop->{
      _id,
      title,
      date,
      startTime,
      endTime,
      capacity
    },
    conference->{
      _id,
      name
    },
    status,
    signupDate,
    notes,
    _createdAt,
    _updatedAt
  }`

  return await clientWrite.fetch(query, { workshopId })
}

/**
 * Get workshop signup statistics for a speaker's workshops
 * @param speakerId Speaker ID
 * @param conferenceId Conference ID
 * @returns Statistics for each workshop
 */
export async function getWorkshopSignupStatisticsBySpeaker(
  speakerId: string,
  conferenceId: string
) {
  console.log('Fetching workshop stats for speaker:', { speakerId, conferenceId })

  // Query uses speakers array instead of single speaker reference
  const query = groq`*[_type == "talk" && $speakerId in speakers[]._ref && conference._ref == $conferenceId && format in ["workshop_120", "workshop_240"]] {
    _id,
    title,
    capacity,
    format,
    "signups": *[_type == "workshopSignup" && workshop._ref == ^._id] {
      _id,
      status,
      experienceLevel,
      operatingSystem
    }
  }`

  const workshops = await clientWrite.fetch(query, { speakerId, conferenceId })
  console.log('Found workshops for speaker:', workshops)

  return workshops.map((workshop: any) => {
    const confirmedSignups = workshop.signups.filter(
      (s: any) => s.status === 'confirmed'
    )
    const waitlistSignups = workshop.signups.filter(
      (s: any) => s.status === 'waitlist'
    )

    // Count experience levels
    const experienceLevels = {
      beginner: confirmedSignups.filter((s: any) => s.experienceLevel === 'beginner')
        .length,
      intermediate: confirmedSignups.filter(
        (s: any) => s.experienceLevel === 'intermediate'
      ).length,
      advanced: confirmedSignups.filter((s: any) => s.experienceLevel === 'advanced')
        .length,
    }

    // Count operating systems
    const operatingSystems = {
      windows: confirmedSignups.filter((s: any) => s.operatingSystem === 'windows')
        .length,
      macos: confirmedSignups.filter((s: any) => s.operatingSystem === 'macos').length,
      linux: confirmedSignups.filter((s: any) => s.operatingSystem === 'linux').length,
    }

    return {
      workshopId: workshop._id,
      workshopTitle: workshop.title,
      capacity: workshop.capacity,
      totalSignups: workshop.signups.length,
      confirmedCount: confirmedSignups.length,
      waitlistCount: waitlistSignups.length,
      experienceLevels,
      operatingSystems,
    }
  })
}

/**
 * Get all workshop signups with filters
 * @param filters Filter options
 * @returns Array of workshop signups
 */
export async function getAllWorkshopSignups(filters: {
  conferenceId?: string
  workshopId?: string
  status?: string
  signupIds?: string[]
  page?: number
  pageSize?: number
}): Promise<WorkshopSignupExisting[]> {
  const conditions = ['_type == "workshopSignup"']

  if (filters.conferenceId) {
    conditions.push(`conference._ref == "${filters.conferenceId}"`)
  }

  if (filters.workshopId) {
    conditions.push(`workshop._ref == "${filters.workshopId}"`)
  }

  if (filters.status) {
    conditions.push(`status == "${filters.status}"`)
  }

  if (filters.signupIds && filters.signupIds.length > 0) {
    const ids = filters.signupIds.map(id => `"${id}"`).join(', ')
    conditions.push(`_id in [${ids}]`)
  }

  const whereClause = conditions.join(' && ')
  const page = filters.page || 1
  const pageSize = filters.pageSize || 50
  const start = (page - 1) * pageSize
  const end = start + pageSize

  const query = groq`*[${whereClause}] | order(signupDate desc) [${start}...${end}] {
    _id,
    _type,
    userEmail,
    userName,
    userWorkOSId,
    workshop->{
      _id,
      _ref,
      title,
      date,
      startTime,
      endTime,
      capacity
    },
    conference->{
      _id,
      _ref,
      name
    },
    status,
    signupDate,
    notes,
    _createdAt,
    _updatedAt
  }`

  return await clientWrite.fetch(query)
}

/**
 * Get all workshops for a conference
 * @param conferenceId The ID of the conference
 * @returns Array of workshops
 */
export async function getWorkshopsByConference(conferenceId: string): Promise<WorkshopWithCapacity[]> {
  return getAvailableWorkshops(conferenceId)
}

/**
 * Get workshop statistics for a conference
 * @param conferenceId The ID of the conference
 * @returns Workshop statistics
 */
export async function getWorkshopStatistics(conferenceId: string) {
  const workshops = await getAvailableWorkshops(conferenceId)
  const allSignups = await getAllWorkshopSignups({ conferenceId })

  const workshopStats = workshops.map(workshop => {
    const workshopSignups = allSignups.filter(s => s.workshop._id === workshop._id)

    const statusCounts = workshopSignups.reduce((acc, signup) => {
      acc[signup.status] = (acc[signup.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      workshopId: workshop._id,
      workshopTitle: workshop.title,
      capacity: workshop.capacity,
      totalSignups: workshopSignups.length,
      confirmedSignups: statusCounts.confirmed || 0,
      pendingSignups: statusCounts.pending || 0,
      waitlistSignups: statusCounts.waitlist || 0,
      cancelledSignups: statusCounts.cancelled || 0,
      utilization: workshop.capacity > 0
        ? ((statusCounts.confirmed || 0) / workshop.capacity) * 100
        : 0,
    }
  })

  const totals = {
    totalWorkshops: workshops.length,
    totalCapacity: workshops.reduce((sum, w) => sum + w.capacity, 0),
    totalSignups: allSignups.filter(s => s.status === 'confirmed' || s.status === 'waitlist').length,
    totalConfirmed: workshopStats.reduce((sum, s) => sum + s.confirmedSignups, 0),
    totalPending: workshopStats.reduce((sum, s) => sum + s.pendingSignups, 0),
    totalWaitlist: workshopStats.reduce((sum, s) => sum + s.waitlistSignups, 0),
    totalCancelled: workshopStats.reduce((sum, s) => sum + s.cancelledSignups, 0),
    averageUtilization: workshopStats.length > 0
      ? workshopStats.reduce((sum, s) => sum + s.utilization, 0) / workshops.length
      : 0,
  }

  return {
    workshops: workshopStats,
    totals,
  }
}