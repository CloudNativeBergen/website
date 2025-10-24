import type { ConferenceSchedule } from '@/lib/conference/types'
import { isScheduleToday } from '@/lib/program/time-utils'

/**
 * Sort schedules to prioritize today's schedule first, then by date
 */
export function sortSchedulesByDate(
  schedules: ConferenceSchedule[],
  currentTime: Date,
): ConferenceSchedule[] {
  return [...schedules].sort((a, b) => {
    const aIsToday = isScheduleToday(a.date, currentTime)
    const bIsToday = isScheduleToday(b.date, currentTime)
    if (aIsToday && !bIsToday) return -1
    if (!aIsToday && bIsToday) return 1
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })
}

/**
 * Sort talks by start time
 */
export function sortTalksByStartTime<T extends { startTime?: string }>(
  talks: T[],
): T[] {
  return [...talks].sort((a, b) => {
    if (!a.startTime || !b.startTime) return 0
    return a.startTime.localeCompare(b.startTime)
  })
}
