import { useMemo, useState, useEffect } from 'react'
import { ConferenceSchedule } from '@/lib/conference/types'
import {
  TalkStatus,
  CurrentPosition,
  getCurrentConferenceTime,
  isConferenceDay,
  findCurrentTalkPosition,
  getTalkStatusMap,
} from '@/lib/program/time-utils'
import { onSimulatedTimeChange } from '@/lib/program/dev-time'

interface UseLiveProgramResult {
  isLive: boolean
  currentPosition: CurrentPosition | null
  talkStatusMap: Map<string, TalkStatus>
  currentTime: Date
}

export function useLiveProgram(
  schedules: ConferenceSchedule[],
  conferenceStartDate: string,
  conferenceEndDate: string,
): UseLiveProgramResult {
  const [triggerUpdate, setTriggerUpdate] = useState(0)

  useEffect(() => {
    const unsubscribe = onSimulatedTimeChange(() => {
      setTriggerUpdate((prev) => prev + 1)
    })
    return unsubscribe
  }, [])

  const currentTime = useMemo(
    () => getCurrentConferenceTime(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerUpdate intentionally triggers recalculation
    [triggerUpdate],
  )

  const isLive = useMemo(
    () => isConferenceDay(conferenceStartDate, conferenceEndDate, currentTime),
    [conferenceStartDate, conferenceEndDate, currentTime],
  )

  const currentPosition = useMemo(
    () => (isLive ? findCurrentTalkPosition(schedules, currentTime) : null),
    [isLive, schedules, currentTime],
  )

  const talkStatusMap = useMemo(
    () => (isLive ? getTalkStatusMap(schedules, currentTime) : new Map()),
    [isLive, schedules, currentTime],
  )

  return {
    isLive,
    currentPosition,
    talkStatusMap,
    currentTime,
  }
}
