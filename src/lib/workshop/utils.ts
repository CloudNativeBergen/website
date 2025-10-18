import type { ProposalWithWorkshopData } from './types'
import type { Format } from '@/lib/proposal/types'

export function getWorkshopDuration(format: Format): string {
  if (format === 'workshop_120') return '2 hours'
  if (format === 'workshop_240') return '4 hours'
  return '2 hours'
}

export function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${displayHour}:${minutes} ${ampm}`
}

export function getWorkshopDateTime(workshop: ProposalWithWorkshopData) {
  return {
    date: workshop.date || workshop.scheduleInfo?.date,
    startTime: workshop.startTime || workshop.scheduleInfo?.timeSlot?.startTime,
    endTime: workshop.endTime || workshop.scheduleInfo?.timeSlot?.endTime,
    room: workshop.room || workshop.scheduleInfo?.room,
  }
}

export function checkTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const startTime1 = start1.replace(':', '')
  const endTime1 = end1.replace(':', '')
  const startTime2 = start2.replace(':', '')
  const endTime2 = end2.replace(':', '')

  return (
    (startTime1 >= startTime2 && startTime1 < endTime2) ||
    (endTime1 > startTime2 && endTime1 <= endTime2) ||
    (startTime1 <= startTime2 && endTime1 >= endTime2)
  )
}

export interface TimeConflictResult {
  hasConflict: boolean
  conflictingWorkshop: ProposalWithWorkshopData | null
}

export function checkWorkshopTimeConflict(
  workshop: ProposalWithWorkshopData,
  userWorkshops: ProposalWithWorkshopData[],
): TimeConflictResult {
  const {
    date: workshopDate,
    startTime: workshopStart,
    endTime: workshopEnd,
  } = getWorkshopDateTime(workshop)

  if (!workshopDate || !workshopStart || !workshopEnd) {
    return { hasConflict: false, conflictingWorkshop: null }
  }

  const conflictingWorkshop = userWorkshops.find((userWorkshop) => {
    if (userWorkshop._id === workshop._id) return false

    const {
      date: existingDate,
      startTime: existingStart,
      endTime: existingEnd,
    } = getWorkshopDateTime(userWorkshop)

    if (!existingDate || !existingStart || !existingEnd) {
      return false
    }

    const isSameDay = existingDate === workshopDate
    if (!isSameDay) return false

    return checkTimeOverlap(
      workshopStart,
      workshopEnd,
      existingStart,
      existingEnd,
    )
  })

  return {
    hasConflict: !!conflictingWorkshop,
    conflictingWorkshop: conflictingWorkshop || null,
  }
}

export function getWorkshopIdFromSignup(signup: {
  workshop?: { _ref?: string; _id?: string }
}): string {
  return signup.workshop?._ref || signup.workshop?._id || ''
}
