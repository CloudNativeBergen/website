'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ClockIcon,
  XMarkIcon,
  PlayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import {
  setSimulatedTime,
  clearSimulatedTime,
  getSimulatedTime,
  onSimulatedTimeChange,
} from '@/lib/program/dev-time'
import { getCurrentConferenceTime } from '@/lib/program/time-utils'
import { ConferenceSchedule } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'

interface DevTimeControlProps {
  schedules?: ConferenceSchedule[]
}

const addDays = (dateString: string, days: number): string => {
  const date = new Date(dateString)
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

const formatDateOption = (dateString: string): string => {
  return formatConferenceDateLong(dateString)
}

export function DevTimeControl({ schedules = [] }: DevTimeControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [isSimulated, setIsSimulated] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const simulated = getSimulatedTime()
      setIsSimulated(simulated !== null)
      setCurrentTime(getCurrentConferenceTime())
    }

    const updateInputFields = () => {
      const simulated = getSimulatedTime()
      if (simulated) {
        // Format date as YYYY-MM-DD in local timezone
        const year = simulated.getFullYear()
        const month = String(simulated.getMonth() + 1).padStart(2, '0')
        const day = String(simulated.getDate()).padStart(2, '0')
        setSelectedDate(`${year}-${month}-${day}`)

        // Format time as HH:MM in local timezone
        const hours = String(simulated.getHours()).padStart(2, '0')
        const minutes = String(simulated.getMinutes()).padStart(2, '0')
        setSelectedTime(`${hours}:${minutes}`)
      } else if (schedules.length > 0 && !selectedDate) {
        setSelectedDate(schedules[0].date)
        setSelectedTime('10:00')
      }
    }

    updateInputFields()
    updateTime()

    const unsubscribe = onSimulatedTimeChange(updateInputFields)
    const interval = setInterval(updateTime, 1000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [schedules, selectedDate])

  const handleSetTime = () => {
    if (!selectedDate || !selectedTime) return

    try {
      // Create date in local timezone
      const [year, month, day] = selectedDate.split('-').map(Number)
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const date = new Date(year, month - 1, day, hours, minutes, 0)
      setSimulatedTime(date)
    } catch (error) {
      console.error('Invalid time format:', error)
      alert('Invalid date/time selection')
    }
  }

  const handleClear = () => {
    clearSimulatedTime()
    if (schedules.length > 0) {
      setSelectedDate(schedules[0].date)
      setSelectedTime('10:00')
    }
  }

  const handleSetNow = () => {
    setSimulatedTime(new Date())
  }

  const quickTimes = useMemo(() => {
    if (schedules.length === 0) {
      return [
        {
          label: '08:00',
          time: '2025-10-30T08:00:00+01:00',
          desc: 'Before event',
        },
        {
          label: '09:59',
          time: '2025-10-30T09:59:00+01:00',
          desc: 'Starting soon',
        },
        {
          label: '10:30',
          time: '2025-10-30T10:30:00+01:00',
          desc: 'During talk',
        },
        {
          label: '15:00',
          time: '2025-10-30T15:00:00+01:00',
          desc: 'After event',
        },
      ]
    }

    const firstSchedule = schedules[0]
    if (
      !firstSchedule?.tracks ||
      !Array.isArray(firstSchedule.tracks) ||
      firstSchedule.tracks.length === 0
    ) {
      return []
    }

    const firstTrack = firstSchedule.tracks[0]
    if (!firstTrack?.talks || !Array.isArray(firstTrack.talks)) {
      return []
    }

    const firstTalk = firstTrack.talks[0]
    const secondTalk = firstTrack.talks[1]

    if (!firstTalk) {
      return []
    }

    const scheduleDate = firstSchedule.date

    const createDateTime = (
      time: string,
      offsetMinutes: number = 0,
    ): string => {
      const date = new Date(`${scheduleDate}T${time}:00+01:00`)
      date.setMinutes(date.getMinutes() + offsetMinutes)
      return (
        date.toISOString().replace('Z', '+01:00').substring(0, 19) + '+01:00'
      )
    }

    return [
      {
        label: '08:00',
        time: `${scheduleDate}T08:00:00+01:00`,
        desc: 'Before event',
      },
      {
        label: firstTalk.startTime.substring(0, 5),
        time: createDateTime(firstTalk.startTime, -1),
        desc: 'Starting soon',
      },
      {
        label: secondTalk ? secondTalk.startTime.substring(0, 5) : '10:30',
        time: secondTalk
          ? createDateTime(secondTalk.startTime, 15)
          : `${scheduleDate}T10:30:00+01:00`,
        desc: 'During talk',
      },
      {
        label: '17:00',
        time: `${scheduleDate}T17:00:00+01:00`,
        desc: 'After event',
      },
    ]
  }, [schedules])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm shadow-lg transition-all ${
          isSimulated
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-gray-800 text-white hover:bg-gray-700'
        }`}
        title="Dev Time Control"
      >
        <ClockIcon className="h-5 w-5" />
        <span className="hidden sm:inline">
          {currentTime?.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </span>
        {isSimulated && (
          <span className="hidden rounded bg-white/20 px-2 py-0.5 text-xs sm:inline">
            SIM
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed right-4 bottom-20 z-50 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Dev Time Control
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Current Time{' '}
                {isSimulated && (
                  <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                    Simulated
                  </span>
                )}
              </div>
              <div className="rounded bg-gray-100 p-2 font-mono text-sm text-gray-900 dark:bg-gray-700 dark:text-white">
                {currentTime?.toLocaleString('sv-SE', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Set Date & Time
              </label>
              <div className="space-y-2">
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select a day...</option>
                  {schedules.length > 0 && (
                    <option value={addDays(schedules[0].date, -1)}>
                      {formatDateOption(addDays(schedules[0].date, -1))}{' '}
                      (Before)
                    </option>
                  )}
                  {schedules.map((schedule) => (
                    <option key={schedule._id} value={schedule.date}>
                      {formatDateOption(schedule.date)}
                    </option>
                  ))}
                  {schedules.length > 0 && (
                    <option
                      value={addDays(schedules[schedules.length - 1].date, 1)}
                    >
                      {formatDateOption(
                        addDays(schedules[schedules.length - 1].date, 1),
                      )}{' '}
                      (After)
                    </option>
                  )}
                </select>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    onClick={handleSetTime}
                    disabled={!selectedDate || !selectedTime}
                    className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlayIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Quick Times
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickTimes.map((qt) => (
                  <button
                    key={qt.time}
                    onClick={() => setSimulatedTime(qt.time)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-left text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    <div className="font-mono font-semibold text-gray-900 dark:text-white">
                      {qt.label}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {qt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                onClick={handleSetNow}
                className="flex flex-1 items-center justify-center gap-2 rounded bg-gray-500 px-3 py-2 text-sm font-medium text-white hover:bg-gray-600"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Set to Now
              </button>
              <button
                onClick={handleClear}
                className="flex flex-1 items-center justify-center gap-2 rounded bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                <XMarkIcon className="h-4 w-4" />
                Clear
              </button>
            </div>

            <div className="rounded bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
              <div className="mb-1 font-semibold">Console Access:</div>
              <code>devTime.set(&quot;2025-10-30T10:30:00&quot;)</code>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
