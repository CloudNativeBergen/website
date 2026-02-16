/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import {
  isScheduleInPast,
  isScheduleToday,
  getCurrentConferenceTime,
} from '@/lib/program/time-utils'

describe('program/time-utils.ts', () => {
  describe('isScheduleInPast', () => {
    it('should return true for dates in the past', () => {
      const currentTime = new Date('2025-10-28T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(true)
    })

    it('should return false for today', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should return false for dates in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-28'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should handle dates far in the past', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2024-01-01'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(true)
    })

    it('should handle dates far in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2026-12-31'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should ignore time of day (only compare dates)', () => {
      // Morning
      const morningTime = new Date('2025-10-28T08:00:00')
      expect(isScheduleInPast('2025-10-27', morningTime)).toBe(true)

      // Evening
      const eveningTime = new Date('2025-10-28T23:59:59')
      expect(isScheduleInPast('2025-10-27', eveningTime)).toBe(true)

      // Today should still be false regardless of time
      expect(isScheduleInPast('2025-10-28', morningTime)).toBe(false)
      expect(isScheduleInPast('2025-10-28', eveningTime)).toBe(false)
    })
  })

  describe('isScheduleToday', () => {
    it('should return true when schedule date matches current date', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(true)
    })

    it('should return false when schedule date is in the past', () => {
      const currentTime = new Date('2025-10-28T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(false)
    })

    it('should return false when schedule date is in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-28'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(false)
    })
  })

  describe('integration: isScheduleInPast and isScheduleToday', () => {
    it('should have mutually exclusive results for past and today', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const yesterdayDate = '2025-10-26'
      const todayDate = '2025-10-27'
      const tomorrowDate = '2025-10-28'

      // Yesterday
      expect(isScheduleInPast(yesterdayDate, currentTime)).toBe(true)
      expect(isScheduleToday(yesterdayDate, currentTime)).toBe(false)

      // Today
      expect(isScheduleInPast(todayDate, currentTime)).toBe(false)
      expect(isScheduleToday(todayDate, currentTime)).toBe(true)

      // Tomorrow
      expect(isScheduleInPast(tomorrowDate, currentTime)).toBe(false)
      expect(isScheduleToday(tomorrowDate, currentTime)).toBe(false)
    })
  })
})
