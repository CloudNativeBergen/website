import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import type {
  ProposalWithWorkshopData,
  WorkshopSignupInput,
  WorkshopSignupExisting,
} from './types'
import { WorkshopSignupStatus } from './types'
import { getWorkshops } from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'

const workshopSignupLocks = new Map<string, Promise<WorkshopSignupExisting>>()

export async function getWorkshopSignups(
  userWorkOSId: string,
  conferenceId: string,
  status?: string,
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
      "capacity": coalesce(capacity, 30),
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
      available: 0,
    }
  }

  const available = result.capacity - result.signupCount

  return {
    totalCapacity: result.capacity,
    confirmedSignups: result.signupCount,
    availableSpots: available,
    capacity: result.capacity,
    signups: result.signupCount,
    available: available,
  }
}

export async function createWorkshopSignup(
  signupData: WorkshopSignupInput,
): Promise<WorkshopSignupExisting> {
  const workshopId = signupData.workshop._ref

  const existingLock = workshopSignupLocks.get(workshopId)

  if (existingLock) {
    await existingLock
  }

  const lockPromise = (async () => {
    try {
      const existingSignup = await clientWrite.fetch(
        groq`*[_type == "workshopSignup" && userWorkOSId == $userWorkOSId && workshop._ref == $workshopId && (status == "confirmed" || status == "waitlist")][0]`,
        { userWorkOSId: signupData.userWorkOSId, workshopId },
      )

      if (existingSignup) {
        throw new Error('User is already signed up for this workshop')
      }

      let signupStatus: 'confirmed' | 'waitlist' = 'confirmed'
      if (
        'status' in signupData &&
        typeof signupData.status === 'string' &&
        (signupData.status === 'confirmed' || signupData.status === 'waitlist')
      ) {
        signupStatus = signupData.status
      } else {
        const capacityInfo = await checkWorkshopCapacity(workshopId)
        if (capacityInfo.available <= 0) {
          signupStatus = 'waitlist'
        }
      }

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
        experienceLevel: signupData.experienceLevel,
        operatingSystem: signupData.operatingSystem,
      }

      tx.create(document)
      const result = await tx.commit()

      const createdId = result.documentIds[0]

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
        { id: createdId },
      )

      return fullSignup
    } finally {
      setTimeout(() => {
        workshopSignupLocks.delete(workshopId)
      }, 100)
    }
  })()

  workshopSignupLocks.set(workshopId, lockPromise)

  return lockPromise
}

export async function verifyWorkshopBelongsToConference(
  workshopId: string,
  conferenceId: string,
): Promise<boolean> {
  const query = groq`
    *[_type == "talk" && _id == $workshopId && conference._ref == $conferenceId][0]
  `

  const result = await clientWrite.fetch(query, { workshopId, conferenceId })
  return !!result
}

export async function cancelWorkshopSignup(
  signupId: string,
  reason: string,
): Promise<WorkshopSignupExisting> {
  return clientWrite
    .patch(signupId)
    .set({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
    })
    .commit()
}

export async function deleteWorkshopSignup(signupId: string): Promise<void> {
  await clientWrite.delete(signupId)
}

export async function getWorkshopById(
  workshopId: string,
): Promise<ProposalWithWorkshopData | null> {
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
      "capacity": coalesce(capacity, 30),
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

  return clientWrite.fetch<ProposalWithWorkshopData | null>(query, {
    workshopId,
  })
}

export async function updateWorkshopSignupEmailStatus(
  signupId: string,
  emailSent: boolean,
): Promise<WorkshopSignupExisting> {
  return clientWrite
    .patch(signupId)
    .set({ confirmationEmailSent: emailSent })
    .commit()
}

export async function confirmWorkshopSignup(
  signupId: string,
): Promise<WorkshopSignupExisting> {
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
    { signupId },
  )

  if (!signup) {
    throw new Error('Signup not found')
  }

  await clientWrite
    .patch(signupId)
    .set({
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    })
    .commit()

  return {
    ...signup,
    status: 'confirmed' as WorkshopSignupStatus,
  }
}

export async function updateWorkshopCapacity(
  workshopId: string,
  capacity: number,
): Promise<ProposalWithWorkshopData> {
  await clientWrite.patch(workshopId).set({ capacity: capacity }).commit()

  const updatedWorkshop = await getWorkshopById(workshopId)
  if (!updatedWorkshop) {
    throw new Error('Workshop not found after update')
  }

  return updatedWorkshop
}

export async function getWorkshopSignupsByWorkshop(
  workshopId: string,
  status?: string,
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

export async function getWorkshopSignupStatisticsBySpeaker(
  speakerId: string,
  conferenceId: string,
) {
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

  interface WorkshopSignupData {
    status: string
    experienceLevel?: string
    operatingSystem?: string
  }

  interface WorkshopData {
    _id: string
    title: string
    capacity: number
    signups: WorkshopSignupData[]
  }

  return workshops.map((workshop: WorkshopData) => {
    const confirmedSignups = workshop.signups.filter(
      (s) => s.status === 'confirmed',
    )
    const waitlistSignups = workshop.signups.filter(
      (s) => s.status === 'waitlist',
    )

    const experienceLevels = {
      beginner: confirmedSignups.filter((s) => s.experienceLevel === 'beginner')
        .length,
      intermediate: confirmedSignups.filter(
        (s) => s.experienceLevel === 'intermediate',
      ).length,
      advanced: confirmedSignups.filter((s) => s.experienceLevel === 'advanced')
        .length,
    }

    const operatingSystems = {
      windows: confirmedSignups.filter((s) => s.operatingSystem === 'windows')
        .length,
      macos: confirmedSignups.filter((s) => s.operatingSystem === 'macos')
        .length,
      linux: confirmedSignups.filter((s) => s.operatingSystem === 'linux')
        .length,
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
    const ids = filters.signupIds.map((id) => `"${id}"`).join(', ')
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

export async function getWorkshopsByConference(
  conferenceId: string,
): Promise<ProposalWithWorkshopData[]> {
  const { workshops } = await getWorkshops({
    conferenceId,
    statuses: [Status.confirmed],
    includeScheduleInfo: true,
  })
  return workshops as ProposalWithWorkshopData[]
}

export async function getWorkshopStatistics(conferenceId: string) {
  const { workshops } = await getWorkshops({
    conferenceId,
    statuses: [Status.confirmed],
    includeScheduleInfo: true,
  })

  const workshopsWithData = workshops as ProposalWithWorkshopData[]

  // Fetch all signups across multiple pages to get unique participants count
  let allSignups: WorkshopSignupExisting[] = []
  let currentPage = 1
  let hasMore = true

  while (hasMore) {
    const pageSignups = await getAllWorkshopSignups({
      conferenceId,
      page: currentPage,
      pageSize: 100,
    })
    allSignups = [...allSignups, ...pageSignups]
    hasMore = pageSignups.length === 100
    currentPage++
  }

  const workshopStats = workshopsWithData.map((workshop) => {
    const confirmedSignups = workshop.signups || 0
    const waitlistSignups = workshop.waitlistCount || 0

    return {
      workshopId: workshop._id,
      workshopTitle: workshop.title,
      capacity: workshop.capacity,
      totalSignups: confirmedSignups + waitlistSignups,
      confirmedSignups,
      pendingSignups: 0,
      waitlistSignups,
      cancelledSignups: 0,
      utilization:
        workshop.capacity > 0
          ? (confirmedSignups / workshop.capacity) * 100
          : 0,
    }
  })

  const uniqueParticipants = new Set(
    allSignups
      .filter((s) => s.status === 'confirmed' || s.status === 'waitlist')
      .map((s) => s.userWorkOSId),
  ).size

  const totals = {
    totalWorkshops: workshopsWithData.length,
    totalCapacity: workshopsWithData.reduce(
      (sum: number, w) => sum + w.capacity,
      0,
    ),
    totalSignups: workshopStats.reduce(
      (sum: number, s) => sum + s.confirmedSignups + s.waitlistSignups,
      0,
    ),
    uniqueParticipants,
    totalConfirmed: workshopStats.reduce(
      (sum: number, s) => sum + s.confirmedSignups,
      0,
    ),
    totalPending: 0,
    totalWaitlist: workshopStats.reduce(
      (sum: number, s) => sum + s.waitlistSignups,
      0,
    ),
    totalCancelled: 0,
    averageUtilization:
      workshopStats.length > 0
        ? workshopStats.reduce((sum: number, s) => sum + s.utilization, 0) /
        workshopsWithData.length
        : 0,
  }

  return {
    workshops: workshopStats,
    totals,
  }
}
