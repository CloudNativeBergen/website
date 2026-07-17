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
  durationBetween,
  getProposalDurationMinutes,
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  matchTalk,
  matchService,
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
  moveServiceSessionToTrack: (
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
      setSchedule((prevSchedule) => {
        if (prevSchedule?._id === initialSchedule?._id) {
          return prevSchedule
        }
        return initialSchedule
      })

      const schedulesToCheck =
        allSchedules || (initialSchedule ? [initialSchedule] : [])

      if (schedulesToCheck.length > 0) {
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

  const performSwap = useCallback(
    (
      dragItem: DragItem,
      targetTalk: TrackTalk,
      dropPosition: DropPosition,
    ): { success: boolean; updatedSchedule?: ConferenceSchedule } => {
      if (!schedule || !dragItem.proposal || !targetTalk.talk)
        return { success: false }

      const { proposal } = dragItem
      const { trackIndex, timeSlot } = dropPosition

      const draggedDuration = getProposalDurationMinutes(proposal)
      const draggedEndTime = calculateEndTime(timeSlot, draggedDuration)

      const targetDuration = getProposalDurationMinutes(targetTalk.talk)
      const targetEndTime = calculateEndTime(
        dragItem.sourceTimeSlot!,
        targetDuration,
      )

      let updatedSchedule: ConferenceSchedule | null = null

      setSchedule((prev) => {
        if (!prev) return prev

        const newSchedule = { ...prev }
        const newTracks = [...newSchedule.tracks]

        if (
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

        const currentTargetTrack = newTracks[trackIndex]
        const newTargetTalks = currentTargetTrack.talks.filter(
          (talk) =>
            !(
              talk.talk?._id === targetTalk.talk!._id &&
              talk.startTime === targetTalk.startTime
            ),
        )

        const newDraggedTalk: TrackTalk = {
          talk: proposal,
          startTime: timeSlot,
          endTime: draggedEndTime,
        }

        newTracks[trackIndex] = {
          ...currentTargetTrack,
          talks: [...newTargetTalks, newDraggedTalk].sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          ),
        }

        if (
          dragItem.sourceTrackIndex !== undefined &&
          dragItem.sourceTimeSlot !== undefined
        ) {
          const newTargetTalkAtSource: TrackTalk = {
            talk: targetTalk.talk,
            startTime: dragItem.sourceTimeSlot,
            endTime: targetEndTime,
          }

          const finalSourceTrack = newTracks[dragItem.sourceTrackIndex]
          newTracks[dragItem.sourceTrackIndex] = {
            ...finalSourceTrack,
            talks: [...finalSourceTrack.talks, newTargetTalkAtSource].sort(
              (a, b) => a.startTime.localeCompare(b.startTime),
            ),
          }
        }

        newSchedule.tracks = newTracks
        updatedSchedule = newSchedule
        return newSchedule
      })

      return { success: true, updatedSchedule: updatedSchedule || undefined }
    },
    [schedule],
  )

  const moveTalkToTrack = useCallback(
    (
      dragItem: DragItem,
      dropPosition: DropPosition,
    ): { success: boolean; updatedSchedule?: ConferenceSchedule } => {
      if (!schedule || !dragItem.proposal) return { success: false }

      const { proposal } = dragItem
      const { trackIndex, timeSlot } = dropPosition

      if (trackIndex < 0 || trackIndex >= schedule.tracks.length)
        return { success: false }

      const targetTrack = schedule.tracks[trackIndex]
      const durationMinutes = getProposalDurationMinutes(proposal)
      const endTime = calculateEndTime(timeSlot, durationMinutes)

      if (dragItem.type !== 'scheduled-talk') {
        const isDuplicate = schedule.tracks.some((track) =>
          track.talks.some((talk) => talk.talk?._id === proposal._id),
        )
        if (isDuplicate) {
          return { success: false }
        }
      }

      const occupiedTalk = targetTrack.talks.find(
        (talk) => talk.startTime === timeSlot,
      )

      if (
        occupiedTalk &&
        occupiedTalk.talk &&
        dragItem.type === 'scheduled-talk' &&
        dragItem.sourceTrackIndex !== undefined &&
        dragItem.sourceTimeSlot !== undefined
      ) {
        const sourceTrack = schedule.tracks[dragItem.sourceTrackIndex]
        // Validate BOTH directions: the dragged talk must fit in the target
        // slot AND the displaced talk must fit back into the source track.
        // Checking only the forward direction let a swap leave the source track
        // overlapping.
        const draggedExclude = matchTalk(proposal._id, dragItem.sourceTimeSlot)
        if (
          !canSwapTalks(targetTrack, proposal, occupiedTalk, timeSlot) ||
          !sourceTrack ||
          !canPlaceDisplacedBack(
            sourceTrack,
            occupiedTalk,
            dragItem.sourceTimeSlot,
            draggedExclude,
          )
        ) {
          return { success: false }
        }

        return performSwap(dragItem, occupiedTalk, dropPosition)
      }

      if (occupiedTalk) {
        return { success: false }
      }

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
        return { success: false }
      }

      let updatedSchedule: ConferenceSchedule | null = null

      setSchedule((prev) => {
        if (!prev) return prev

        const newSchedule = { ...prev }
        const newTracks = [...newSchedule.tracks]

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
    [schedule, performSwap],
  )

  const moveServiceSessionToTrack = useCallback(
    (
      dragItem: DragItem,
      dropPosition: DropPosition,
    ): { success: boolean; updatedSchedule?: ConferenceSchedule } => {
      if (!schedule || !dragItem.serviceSession) return { success: false }

      const { serviceSession } = dragItem
      const { trackIndex, timeSlot } = dropPosition

      if (trackIndex < 0 || trackIndex >= schedule.tracks.length)
        return { success: false }

      const durationMinutes = durationBetween(
        serviceSession.startTime,
        serviceSession.endTime,
      )
      const newEndTime = calculateEndTime(timeSlot, durationMinutes)

      // A service session must not be dropped onto an occupied interval (a talk
      // or another session). Previously service-session moves ran zero overlap
      // checks and always succeeded, stacking items on top of each other.
      const targetTrack = schedule.tracks[trackIndex]
      const excludeExisting =
        dragItem.type === 'scheduled-service' &&
        dragItem.sourceTrackIndex === trackIndex &&
        dragItem.sourceTimeSlot !== undefined
          ? matchService(serviceSession.placeholder, dragItem.sourceTimeSlot)
          : undefined
      if (
        !isTrackIntervalFree(targetTrack, timeSlot, newEndTime, excludeExisting)
      ) {
        return { success: false }
      }

      let updatedSchedule: ConferenceSchedule | null = null

      setSchedule((prev) => {
        if (!prev) return prev

        const newSchedule = { ...prev }
        const newTracks = [...newSchedule.tracks]

        if (
          dragItem.type === 'scheduled-service' &&
          dragItem.sourceTrackIndex !== undefined &&
          dragItem.sourceTimeSlot !== undefined
        ) {
          const sourceTrack = newTracks[dragItem.sourceTrackIndex]
          const newSourceTalks = sourceTrack.talks.filter(
            (talk) =>
              !(
                talk.placeholder === serviceSession.placeholder &&
                talk.startTime === dragItem.sourceTimeSlot
              ),
          )
          newTracks[dragItem.sourceTrackIndex] = {
            ...sourceTrack,
            talks: newSourceTalks,
          }
        }

        const targetTrack = newTracks[trackIndex]
        const newServiceSession: TrackTalk = {
          placeholder: serviceSession.placeholder,
          startTime: timeSlot,
          endTime: newEndTime,
        }

        newTracks[trackIndex] = {
          ...targetTrack,
          talks: [...targetTrack.talks, newServiceSession].sort((a, b) =>
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
    moveServiceSessionToTrack,
    removeTalkFromSchedule,
    setInitialData,
    setSchedule,
  }
}
