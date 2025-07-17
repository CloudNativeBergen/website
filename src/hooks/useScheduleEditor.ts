import { useState, useCallback } from 'react'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  DragItem,
  DropPosition,
  calculateEndTime,
  getProposalDurationMinutes,
  findAvailableTimeSlot,
} from '@/lib/schedule/types'

export interface UseScheduleEditorReturn {
  schedule: ConferenceSchedule | null
  unassignedProposals: ProposalExisting[]
  addTrack: (track: ScheduleTrack) => void
  removeTrack: (trackIndex: number) => void
  updateTrack: (trackIndex: number, track: ScheduleTrack) => void
  moveTalkToTrack: (
    dragItem: DragItem,
    dropPosition: DropPosition,
  ) => { success: boolean; updatedSchedule?: ConferenceSchedule }
  removeTalkFromSchedule: (trackIndex: number, talkIndex: number) => void
  setInitialData: (
    schedule: ConferenceSchedule | null,
    proposals: ProposalExisting[],
    allSchedules?: ConferenceSchedule[],
  ) => void
  setSchedule: (schedule: ConferenceSchedule) => void
}

export function useScheduleEditor(): UseScheduleEditorReturn {
  const [schedule, setSchedule] = useState<ConferenceSchedule | null>(null)
  const [unassignedProposals, setUnassignedProposals] = useState<
    ProposalExisting[]
  >([])

  const setInitialData = useCallback(
    (
      initialSchedule: ConferenceSchedule | null,
      proposals: ProposalExisting[],
      allSchedules?: ConferenceSchedule[],
    ) => {
      // Only update if the schedule has actually changed
      setSchedule((prevSchedule) => {
        if (prevSchedule?._id === initialSchedule?._id) {
          return prevSchedule
        }
        return initialSchedule
      })

      // Calculate unassigned proposals based on ALL schedules, not just current one
      const schedulesToCheck =
        allSchedules || (initialSchedule ? [initialSchedule] : [])

      if (schedulesToCheck.length > 0) {
        // Filter out proposals that are already scheduled in ANY day
        const scheduledProposalIds = new Set(
          schedulesToCheck.flatMap(
            (schedule) =>
              schedule.tracks?.flatMap((track) =>
                track.talks.map((talk) => talk.talk?._id).filter(Boolean),
              ) || [],
          ),
        )

        const unscheduled = proposals.filter(
          (p) => !scheduledProposalIds.has(p._id),
        )

        // Only update if the proposals have actually changed
        setUnassignedProposals((prevProposals) => {
          if (
            prevProposals.length === unscheduled.length &&
            prevProposals.every((p, i) => p._id === unscheduled[i]?._id)
          ) {
            return prevProposals
          }
          return unscheduled
        })
      } else {
        // No schedules available, show all proposals as unassigned
        setUnassignedProposals((prevProposals) => {
          if (
            prevProposals.length === proposals.length &&
            prevProposals.every((p, i) => p._id === proposals[i]?._id)
          ) {
            return prevProposals
          }
          return proposals
        })
      }
    },
    [],
  )

  const addTrack = useCallback((track: ScheduleTrack) => {
    setSchedule((prev) => {
      if (!prev) {
        return {
          _id: '',
          date: new Date().toISOString().split('T')[0],
          tracks: [track],
        }
      }

      return {
        ...prev,
        tracks: [...prev.tracks, track],
      }
    })
  }, [])

  const removeTrack = useCallback((trackIndex: number) => {
    setSchedule((prev) => {
      if (!prev || trackIndex < 0 || trackIndex >= prev.tracks.length)
        return prev

      return {
        ...prev,
        tracks: prev.tracks.filter((_, index) => index !== trackIndex),
      }
    })
  }, [])

  const updateTrack = useCallback(
    (trackIndex: number, track: ScheduleTrack) => {
      setSchedule((prev) => {
        if (!prev || trackIndex < 0 || trackIndex >= prev.tracks.length)
          return prev

        const newTracks = [...prev.tracks]
        newTracks[trackIndex] = track

        return {
          ...prev,
          tracks: newTracks,
        }
      })
    },
    [],
  )

  const moveTalkToTrack = useCallback(
    (
      dragItem: DragItem,
      dropPosition: DropPosition,
    ): { success: boolean; updatedSchedule?: ConferenceSchedule } => {
      if (!schedule) return { success: false }

      const { proposal } = dragItem
      const { trackIndex, timeSlot } = dropPosition

      if (trackIndex < 0 || trackIndex >= schedule.tracks.length)
        return { success: false }

      const targetTrack = schedule.tracks[trackIndex]
      const durationMinutes = getProposalDurationMinutes(proposal)
      const endTime = calculateEndTime(timeSlot, durationMinutes)

      // Check for conflicts
      const excludeTalk =
        dragItem.type === 'scheduled-talk' &&
        dragItem.sourceTrackIndex === trackIndex
          ? { talkId: proposal._id, startTime: dragItem.sourceTimeSlot! }
          : undefined

      const availableTime = findAvailableTimeSlot(
        targetTrack,
        proposal,
        timeSlot,
        excludeTalk,
      )
      if (!availableTime || availableTime !== timeSlot) {
        return { success: false } // Cannot place here due to conflict
      }

      let updatedSchedule: ConferenceSchedule | null = null

      setSchedule((prev) => {
        if (!prev) return prev

        const newSchedule = { ...prev }
        const newTracks = [...newSchedule.tracks]

        // If moving from another track, remove from source
        if (
          dragItem.type === 'scheduled-talk' &&
          dragItem.sourceTrackIndex !== undefined &&
          dragItem.sourceTimeSlot !== undefined
        ) {
          const sourceTrack = newTracks[dragItem.sourceTrackIndex]
          const newSourceTalks = sourceTrack.talks.filter(
            (talk) =>
              !(
                talk.talk?._id === proposal._id &&
                talk.startTime === dragItem.sourceTimeSlot
              ),
          )
          newTracks[dragItem.sourceTrackIndex] = {
            ...sourceTrack,
            talks: newSourceTalks,
          }
        }

        // Add to target track
        const targetTrack = newTracks[trackIndex]
        const newTalk: TrackTalk = {
          talk: proposal,
          startTime: timeSlot,
          endTime: endTime,
        }

        newTracks[trackIndex] = {
          ...targetTrack,
          talks: [...targetTrack.talks, newTalk].sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          ),
        }

        newSchedule.tracks = newTracks
        updatedSchedule = newSchedule
        return newSchedule
      })

      return { success: true, updatedSchedule: updatedSchedule || undefined }
    },
    [schedule],
  )

  const removeTalkFromSchedule = useCallback(
    (trackIndex: number, talkIndex: number) => {
      setSchedule((prev) => {
        if (!prev || trackIndex < 0 || trackIndex >= prev.tracks.length)
          return prev

        const track = prev.tracks[trackIndex]
        if (talkIndex < 0 || talkIndex >= track.talks.length) return prev

        const newTracks = [...prev.tracks]
        newTracks[trackIndex] = {
          ...track,
          talks: track.talks.filter((_, index) => index !== talkIndex),
        }

        return {
          ...prev,
          tracks: newTracks,
        }
      })
    },
    [],
  )

  return {
    schedule,
    unassignedProposals,
    addTrack,
    removeTrack,
    updateTrack,
    moveTalkToTrack,
    removeTalkFromSchedule,
    setInitialData,
    setSchedule,
  }
}
