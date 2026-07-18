import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  DragItem,
  DropPosition,
  EditorSchedule,
  Slot,
  TalkSlot,
  toEditorTrack,
  calculateEndTime,
  getProposalDurationMinutes,
  durationBetween,
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  matchTalk,
  matchService,
} from './types'
import { withinScheduleEnd } from './time'

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
  schedule: EditorSchedule
  ok: boolean
}

const sortByStart = (a: Slot, b: Slot): number =>
  a.startTime.localeCompare(b.startTime)

/**
 * Swap the dragged talk with the talk occupying the target slot. Pure port of
 * the old `performSwap`: the dragged talk moves to `dropPosition`, the displaced
 * target talk moves back to the dragged talk's source slot. Callers MUST have
 * already validated both directions with `canSwapTalks` + `canPlaceDisplacedBack`.
 */
function performSwap(
  schedule: EditorSchedule,
  dragItem: DragItem,
  targetTalk: TalkSlot,
  dropPosition: DropPosition,
): EditorSchedule {
  const proposal = dragItem.proposal!
  const { trackIndex, timeSlot } = dropPosition

  const draggedEndTime = calculateEndTime(
    timeSlot,
    getProposalDurationMinutes(proposal),
  )
  const targetEndTime = calculateEndTime(
    dragItem.sourceTimeSlot!,
    getProposalDurationMinutes(targetTalk.talk),
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
        talk.talk?._id === targetTalk.talk._id &&
        talk.startTime === targetTalk.startTime
      ),
  )
  const newDraggedTalk: TalkSlot = {
    kind: 'talk',
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
    const newTargetTalkAtSource: TalkSlot = {
      kind: 'talk',
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
 * What a proposal drop would do: `move` into an empty slot, `swap` with the
 * occupied talk, or `invalid`. SINGLE SOURCE OF TRUTH for "is this drop legal?"
 * — `moveProposal` applies it, and both UIs (desktop `TimeSlotDropZone.canDrop`,
 * mobile `segmentState`) call it so they can never offer a drop the reducer
 * rejects. Pure, no mutation.
 *
 * `otherScheduledProposalIds` is the cross-day duplicate set (a fresh proposal
 * already scheduled on another day is rejected). It is OPTIONAL only so callers
 * that never place fresh proposals can omit it; every real caller — the reducer
 * (via {@link scheduledProposalIdsExcludingDay}) AND both UIs — passes it, so
 * the "no rejected drop is ever offered" guarantee holds for cross-day dups too.
 */
export type DropClassification = 'move' | 'swap' | 'invalid'

export function classifyProposalDrop(
  tracks: readonly ScheduleTrack[],
  dragItem: DragItem,
  dropPosition: DropPosition,
  otherScheduledProposalIds?: ReadonlySet<string>,
): DropClassification {
  if (!dragItem.proposal) return 'invalid'
  const { proposal } = dragItem
  const { trackIndex, timeSlot } = dropPosition

  if (trackIndex < 0 || trackIndex >= tracks.length) return 'invalid'

  // A move onto the talk's own current slot is a no-op — without this it falls
  // into the swap branch (the "occupied" talk IS the dragged one) and duplicates.
  if (
    dragItem.type === 'scheduled-talk' &&
    dragItem.sourceTrackIndex === trackIndex &&
    dragItem.sourceTimeSlot === timeSlot
  ) {
    return 'invalid'
  }

  const targetTrack = tracks[trackIndex]
  const durationMinutes = getProposalDurationMinutes(proposal)
  const endTime = calculateEndTime(timeSlot, durationMinutes)
  if (!withinScheduleEnd(endTime)) return 'invalid'

  // Duplicate guard: a FRESH drop (not a `scheduled-talk` move) is rejected if
  // the proposal is already scheduled on THIS day or — via
  // `otherScheduledProposalIds` — on ANY other day.
  if (dragItem.type !== 'scheduled-talk') {
    const scheduledHere = tracks.some((track) =>
      track.talks.some((talk) => talk.talk?._id === proposal._id),
    )
    if (scheduledHere || otherScheduledProposalIds?.has(proposal._id)) {
      return 'invalid'
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
    const sourceTrack = tracks[dragItem.sourceTrackIndex]
    // Validate BOTH directions of the swap.
    const draggedExclude = matchTalk(proposal._id, dragItem.sourceTimeSlot)
    return canSwapTalks(targetTrack, proposal, occupiedTalk, timeSlot) &&
      sourceTrack &&
      canPlaceDisplacedBack(
        sourceTrack,
        occupiedTalk,
        dragItem.sourceTimeSlot,
        draggedExclude,
      )
      ? 'swap'
      : 'invalid'
  }

  if (occupiedTalk) return 'invalid'

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
  return availableTime === timeSlot ? 'move' : 'invalid'
}

/**
 * Whether a service-session drop is legal (services never swap, so `move` or
 * `invalid`). Single source of truth shared by `moveServiceSession` and the UIs.
 */
export function classifyServiceDrop(
  tracks: readonly ScheduleTrack[],
  dragItem: DragItem,
  dropPosition: DropPosition,
): 'move' | 'invalid' {
  if (!dragItem.serviceSession) return 'invalid'
  const { serviceSession } = dragItem
  const { trackIndex, timeSlot } = dropPosition

  if (trackIndex < 0 || trackIndex >= tracks.length) return 'invalid'

  const durationMinutes = durationBetween(
    serviceSession.startTime,
    serviceSession.endTime,
  )
  const newEndTime = calculateEndTime(timeSlot, durationMinutes)
  if (!withinScheduleEnd(newEndTime)) return 'invalid'

  const targetTrack = tracks[trackIndex]
  const excludeExisting =
    dragItem.type === 'scheduled-service' &&
    dragItem.sourceTrackIndex === trackIndex &&
    dragItem.sourceTimeSlot !== undefined
      ? matchService(serviceSession.placeholder, dragItem.sourceTimeSlot)
      : undefined

  return isTrackIntervalFree(targetTrack, timeSlot, newEndTime, excludeExisting)
    ? 'move'
    : 'invalid'
}

/**
 * Place / move a proposal into a track slot. Legality is decided by
 * {@link classifyProposalDrop}; this function only applies the resulting
 * move/swap so the rule lives in exactly one place.
 */
export function moveProposal(
  schedule: EditorSchedule,
  dragItem: DragItem,
  dropPosition: DropPosition,
  otherScheduledProposalIds?: ReadonlySet<string>,
): OperationResult {
  const fail: OperationResult = { schedule, ok: false }
  const kind = classifyProposalDrop(
    schedule.tracks,
    dragItem,
    dropPosition,
    otherScheduledProposalIds,
  )
  if (kind === 'invalid') return fail

  // classify returned non-invalid ⇒ dragItem.proposal is present.
  const proposal = dragItem.proposal!
  const { trackIndex, timeSlot } = dropPosition
  const targetTrack = schedule.tracks[trackIndex]

  if (kind === 'swap') {
    const occupiedTalk = targetTrack.talks.find(
      (talk) => talk.startTime === timeSlot,
    )
    // classify returned 'swap' ⇒ the occupying slot is a resolved talk; the
    // `kind` narrow gives performSwap a TalkSlot (no non-null assertion needed).
    if (occupiedTalk?.kind !== 'talk') return fail
    return {
      schedule: performSwap(schedule, dragItem, occupiedTalk, dropPosition),
      ok: true,
    }
  }

  // kind === 'move': drop into the (now-known-free) slot, clearing the source.
  const endTime = calculateEndTime(
    timeSlot,
    getProposalDurationMinutes(proposal),
  )
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
  const newTalk: TalkSlot = {
    kind: 'talk',
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
  schedule: EditorSchedule,
  dragItem: DragItem,
  dropPosition: DropPosition,
): OperationResult {
  const fail: OperationResult = { schedule, ok: false }
  if (
    classifyServiceDrop(schedule.tracks, dragItem, dropPosition) === 'invalid'
  ) {
    return fail
  }

  // classify returned non-invalid ⇒ dragItem.serviceSession is present.
  const serviceSession = dragItem.serviceSession!
  const { trackIndex, timeSlot } = dropPosition
  const durationMinutes = durationBetween(
    serviceSession.startTime,
    serviceSession.endTime,
  )
  const newEndTime = calculateEndTime(timeSlot, durationMinutes)

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
  const newServiceSession: Slot = {
    kind: 'service',
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

/**
 * Append a new track to the day. The UI hands a wide {@link ScheduleTrack}; it is
 * resolved to an {@link EditorTrack} (a brand-new track's `talks` is empty, so
 * this converts trivially) so the day stays an {@link EditorSchedule}.
 */
export function addTrack(
  schedule: EditorSchedule,
  track: ScheduleTrack,
): OperationResult {
  return {
    schedule: {
      ...schedule,
      tracks: [...schedule.tracks, toEditorTrack(track)],
    },
    ok: true,
  }
}

/** Remove the track at `trackIndex` (no-op if out of range). */
export function removeTrack(
  schedule: EditorSchedule,
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

/**
 * Replace the track at `trackIndex` (no-op if out of range). The UI hands a wide
 * {@link ScheduleTrack} (title/description edit carrying the existing talks); it
 * is resolved back to an {@link EditorTrack} — those talks are already ghost-free
 * so the conversion is 1:1, preserving order and fields.
 */
export function updateTrack(
  schedule: EditorSchedule,
  trackIndex: number,
  track: ScheduleTrack,
): OperationResult {
  if (trackIndex < 0 || trackIndex >= schedule.tracks.length) {
    return { schedule, ok: false }
  }
  const newTracks = [...schedule.tracks]
  newTracks[trackIndex] = toEditorTrack(track)
  return { schedule: { ...schedule, tracks: newTracks }, ok: true }
}

/** Remove the talk / service session at `talkIndex` in `trackIndex`. */
export function removeTalk(
  schedule: EditorSchedule,
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
  schedule: EditorSchedule,
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
  const newSession: Slot = {
    kind: 'service',
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
  schedule: EditorSchedule,
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
  schedule: EditorSchedule,
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
  schedule: EditorSchedule,
  serviceSession: TrackTalk,
  sourceTrackIndex: number,
): OperationResult {
  // The UI dispatches the source slot as a wide TrackTalk; a duplicate is always
  // a service, so tag it as a ServiceSlot (the `?? ''` only guards the type — a
  // service session always carries a placeholder).
  const copy: Slot = {
    kind: 'service',
    placeholder: serviceSession.placeholder ?? '',
    startTime: serviceSession.startTime,
    endTime: serviceSession.endTime,
  }
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
      talks: [...track.talks, { ...copy }].sort(sortByStart),
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

/**
 * Ids of proposals scheduled on days OTHER than `dayIndex` — the cross-day
 * duplicate set. Passed as `otherScheduledProposalIds` to
 * {@link classifyProposalDrop} so both the reducer and the drop indicators
 * reject placing a proposal that already lives on another day.
 */
export function scheduledProposalIdsExcludingDay(
  schedules: readonly ConferenceSchedule[],
  dayIndex: number,
): Set<string> {
  const ids = new Set<string>()
  schedules.forEach((schedule, index) => {
    if (index === dayIndex) return
    schedule.tracks?.forEach((track) =>
      track.talks.forEach((talk) => {
        if (talk.talk?._id) ids.add(talk.talk._id)
      }),
    )
  })
  return ids
}
