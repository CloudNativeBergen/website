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
  durationBetween,
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  matchTalk,
  matchService,
  toMinutes,
} from './types'
import { SCHEDULE_END } from './time'

/**
 * Pure schedule transforms, lifted verbatim (behaviour-preserving) from the old
 * `useScheduleEditor` mutators. Every function takes a whole-day
 * {@link ConferenceSchedule} plus its arguments and returns a NEW schedule — no
 * React, no `setState`, deterministic. These are the reducer's core.
 *
 * Placement/overlap validation is delegated to the tested rules in `./rules`
 * (imported via `./types`); this module never re-implements overlap logic.
 */

/** Result of a transform: the (possibly unchanged) schedule and whether it took. */
export interface OperationResult {
  schedule: ConferenceSchedule
  ok: boolean
}

const sortByStart = (a: TrackTalk, b: TrackTalk): number =>
  a.startTime.localeCompare(b.startTime)

/**
 * Does a placement ending at `endTime` fit within the schedule's end-of-day
 * bound? Nothing may extend past {@link SCHEDULE_END}; without this guard an item
 * dropped/created/resized near the bottom of the grid renders below it. Shared by
 * move/create/resize so the rule lives in one place.
 */
function withinScheduleEnd(endTime: string): boolean {
  return toMinutes(endTime) <= toMinutes(SCHEDULE_END)
}

/**
 * Swap the dragged talk with the talk occupying the target slot. Pure port of
 * the old `performSwap`: the dragged talk moves to `dropPosition`, the displaced
 * target talk moves back to the dragged talk's source slot. Callers MUST have
 * already validated both directions with `canSwapTalks` + `canPlaceDisplacedBack`.
 */
function performSwap(
  schedule: ConferenceSchedule,
  dragItem: DragItem,
  targetTalk: TrackTalk,
  dropPosition: DropPosition,
): ConferenceSchedule {
  const proposal = dragItem.proposal!
  const { trackIndex, timeSlot } = dropPosition

  const draggedEndTime = calculateEndTime(
    timeSlot,
    getProposalDurationMinutes(proposal),
  )
  const targetEndTime = calculateEndTime(
    dragItem.sourceTimeSlot!,
    getProposalDurationMinutes(targetTalk.talk!),
  )

  const newTracks = [...schedule.tracks]

  if (
    dragItem.sourceTrackIndex !== undefined &&
    dragItem.sourceTimeSlot !== undefined
  ) {
    const sourceTrack = newTracks[dragItem.sourceTrackIndex]
    newTracks[dragItem.sourceTrackIndex] = {
      ...sourceTrack,
      talks: sourceTrack.talks.filter(
        (talk) =>
          !(
            talk.talk?._id === proposal._id &&
            talk.startTime === dragItem.sourceTimeSlot
          ),
      ),
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
    talks: [...newTargetTalks, newDraggedTalk].sort(sortByStart),
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
        sortByStart,
      ),
    }
  }

  return { ...schedule, tracks: newTracks }
}

/**
 * Place / move a proposal into a track slot (pure port of `moveTalkToTrack`).
 *
 * Duplicate guard: a FRESH drop (not a `scheduled-talk` move) is rejected if the
 * proposal is already scheduled on THIS day or — via `otherScheduledProposalIds`
 * — on ANY other day. This is the cross-day duplicate fix; the old check only
 * looked at the current day so the same talk could be scheduled twice across
 * days.
 */
export function moveProposal(
  schedule: ConferenceSchedule,
  dragItem: DragItem,
  dropPosition: DropPosition,
  otherScheduledProposalIds?: ReadonlySet<string>,
): OperationResult {
  const fail: OperationResult = { schedule, ok: false }
  if (!dragItem.proposal) return fail

  const { proposal } = dragItem
  const { trackIndex, timeSlot } = dropPosition

  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) return fail

  const targetTrack = schedule.tracks[trackIndex]
  const durationMinutes = getProposalDurationMinutes(proposal)
  const endTime = calculateEndTime(timeSlot, durationMinutes)

  // The dragged talk always lands ending at `endTime` (both for a fresh drop and
  // as the forward half of a swap), so a single end-of-day guard covers both.
  if (!withinScheduleEnd(endTime)) return fail

  if (dragItem.type !== 'scheduled-talk') {
    const scheduledHere = schedule.tracks.some((track) =>
      track.talks.some((talk) => talk.talk?._id === proposal._id),
    )
    if (scheduledHere || otherScheduledProposalIds?.has(proposal._id)) {
      return fail
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
    // Validate BOTH directions of the swap: the dragged talk must fit the target
    // slot AND the displaced talk must fit back into the source track.
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
      return fail
    }
    return {
      schedule: performSwap(schedule, dragItem, occupiedTalk, dropPosition),
      ok: true,
    }
  }

  if (occupiedTalk) return fail

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
  if (!availableTime || availableTime !== timeSlot) return fail

  const newTracks = [...schedule.tracks]

  if (
    dragItem.type === 'scheduled-talk' &&
    dragItem.sourceTrackIndex !== undefined &&
    dragItem.sourceTimeSlot !== undefined
  ) {
    const sourceTrack = newTracks[dragItem.sourceTrackIndex]
    newTracks[dragItem.sourceTrackIndex] = {
      ...sourceTrack,
      talks: sourceTrack.talks.filter(
        (talk) =>
          !(
            talk.talk?._id === proposal._id &&
            talk.startTime === dragItem.sourceTimeSlot
          ),
      ),
    }
  }

  const finalTargetTrack = newTracks[trackIndex]
  const newTalk: TrackTalk = {
    talk: proposal,
    startTime: timeSlot,
    endTime,
  }
  newTracks[trackIndex] = {
    ...finalTargetTrack,
    talks: [...finalTargetTrack.talks, newTalk].sort(sortByStart),
  }

  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/**
 * Place / move a service session (break, lunch, …) into a track slot. Pure port
 * of `moveServiceSessionToTrack`: rejected if the interval is not free (overlap
 * check covers both talks and other service sessions).
 */
export function moveServiceSession(
  schedule: ConferenceSchedule,
  dragItem: DragItem,
  dropPosition: DropPosition,
): OperationResult {
  const fail: OperationResult = { schedule, ok: false }
  if (!dragItem.serviceSession) return fail

  const { serviceSession } = dragItem
  const { trackIndex, timeSlot } = dropPosition

  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) return fail

  const durationMinutes = durationBetween(
    serviceSession.startTime,
    serviceSession.endTime,
  )
  const newEndTime = calculateEndTime(timeSlot, durationMinutes)

  if (!withinScheduleEnd(newEndTime)) return fail

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
    return fail
  }

  const newTracks = [...schedule.tracks]

  if (
    dragItem.type === 'scheduled-service' &&
    dragItem.sourceTrackIndex !== undefined &&
    dragItem.sourceTimeSlot !== undefined
  ) {
    const sourceTrack = newTracks[dragItem.sourceTrackIndex]
    newTracks[dragItem.sourceTrackIndex] = {
      ...sourceTrack,
      talks: sourceTrack.talks.filter(
        (talk) =>
          !(
            talk.placeholder === serviceSession.placeholder &&
            talk.startTime === dragItem.sourceTimeSlot
          ),
      ),
    }
  }

  const finalTargetTrack = newTracks[trackIndex]
  const newServiceSession: TrackTalk = {
    placeholder: serviceSession.placeholder,
    startTime: timeSlot,
    endTime: newEndTime,
  }
  newTracks[trackIndex] = {
    ...finalTargetTrack,
    talks: [...finalTargetTrack.talks, newServiceSession].sort(sortByStart),
  }

  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Append a new track to the day. */
export function addTrack(
  schedule: ConferenceSchedule,
  track: ScheduleTrack,
): OperationResult {
  return {
    schedule: { ...schedule, tracks: [...schedule.tracks, track] },
    ok: true,
  }
}

/** Remove the track at `trackIndex` (no-op if out of range). */
export function removeTrack(
  schedule: ConferenceSchedule,
  trackIndex: number,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  return {
    schedule: {
      ...schedule,
      tracks: schedule.tracks.filter((_, index) => index !== trackIndex),
    },
    ok: true,
  }
}

/** Replace the track at `trackIndex` (no-op if out of range). */
export function updateTrack(
  schedule: ConferenceSchedule,
  trackIndex: number,
  track: ScheduleTrack,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = track
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Remove the talk / service session at `talkIndex` in `trackIndex`. */
export function removeTalk(
  schedule: ConferenceSchedule,
  trackIndex: number,
  talkIndex: number,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const track = schedule.tracks[trackIndex]
  if (talkIndex < 0 || talkIndex >= track.talks.length) {
    return { schedule, ok: false }
  }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = {
    ...track,
    talks: track.talks.filter((_, index) => index !== talkIndex),
  }
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Add a service session of `duration` minutes at `startTime` to a track. */
export function addService(
  schedule: ConferenceSchedule,
  trackIndex: number,
  args: { title: string; startTime: string; duration: number },
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const track = schedule.tracks[trackIndex]
  const endTime = calculateEndTime(args.startTime, args.duration)
  if (!withinScheduleEnd(endTime)) return { schedule, ok: false }
  // Reject a new service session that would overlap an existing talk/session
  // (the UI's ＋ button only gates on an exact-start match, so a session can be
  // created inside/over an existing item).
  if (!isTrackIntervalFree(track, args.startTime, endTime)) {
    return { schedule, ok: false }
  }
  const newSession: TrackTalk = {
    placeholder: args.title,
    startTime: args.startTime,
    endTime,
  }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = {
    ...track,
    talks: [...track.talks, newSession].sort(sortByStart),
  }
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Resize the service session at `talkIndex` to a new duration (in minutes). */
export function resizeService(
  schedule: ConferenceSchedule,
  trackIndex: number,
  talkIndex: number,
  duration: number,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const track = schedule.tracks[trackIndex]
  const talk = track.talks[talkIndex]
  if (!talk || !talk.placeholder) return { schedule, ok: false }

  const newEnd = calculateEndTime(talk.startTime, duration)
  if (!withinScheduleEnd(newEnd)) return { schedule, ok: false }
  // Reject a resize that would grow the session over a following talk/session
  // (exclude the session being resized from the check).
  if (
    !isTrackIntervalFree(
      track,
      talk.startTime,
      newEnd,
      matchService(talk.placeholder, talk.startTime),
    )
  ) {
    return { schedule, ok: false }
  }

  const newTalks = [...track.talks]
  newTalks[talkIndex] = {
    ...talk,
    endTime: newEnd,
  }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = { ...track, talks: newTalks }
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Rename the service session at `talkIndex`. */
export function renameService(
  schedule: ConferenceSchedule,
  trackIndex: number,
  talkIndex: number,
  title: string,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const track = schedule.tracks[trackIndex]
  const talk = track.talks[talkIndex]
  if (!talk || !talk.placeholder) return { schedule, ok: false }

  const newTalks = [...track.talks]
  newTalks[talkIndex] = { ...talk, placeholder: title }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = { ...track, talks: newTalks }
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/**
 * Copy a service session into every OTHER track — but SKIP any track where it
 * would overlap an existing item. The old handler computed the conflicting
 * tracks then discarded them (an empty `if` block) and copied into all tracks
 * regardless; this uses `isTrackIntervalFree` to actually skip conflicts.
 *
 * `ok` is true only if the session was copied into at least one track.
 */
export function duplicateService(
  schedule: ConferenceSchedule,
  serviceSession: TrackTalk,
  sourceTrackIndex: number,
): OperationResult {
  let changed = false
  const newTracks = schedule.tracks.map((track, trackIndex) => {
    if (trackIndex === sourceTrackIndex) return track
    if (
      !isTrackIntervalFree(
        track,
        serviceSession.startTime,
        serviceSession.endTime,
      )
    ) {
      return track
    }
    changed = true
    return {
      ...track,
      talks: [...track.talks, { ...serviceSession }].sort(sortByStart),
    }
  })

  if (!changed) return { schedule, ok: false }
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/**
 * Proposals not scheduled on ANY day. Pure port of the `setInitialData` dedup
 * logic: an id is "scheduled" if it appears in any track's talks on any day.
 */
export function computeUnassigned(
  proposals: ProposalExisting[],
  schedules: ConferenceSchedule[],
): ProposalExisting[] {
  const scheduledIds = new Set<string>(
    schedules.flatMap(
      (schedule) =>
        schedule.tracks?.flatMap((track) =>
          track.talks
            .map((talk) => talk.talk?._id)
            .filter((id): id is string => Boolean(id)),
        ) || [],
    ),
  )
  return proposals.filter((proposal) => !scheduledIds.has(proposal._id))
}
