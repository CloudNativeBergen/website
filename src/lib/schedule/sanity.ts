import { randomUUID } from 'crypto'
import { clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { ConferenceSchedule } from '@/lib/conference/types'
import { Conference } from '@/lib/conference/types'
import {
  generateKey,
  createReference,
  createReferenceWithKey,
} from '@/lib/sanity/helpers'
import { notifyScheduleChanges, type SlotPlacement } from '@/lib/reminders'
import { ScheduleStatus } from './types'

export interface SaveScheduleResult {
  schedule?: ConferenceSchedule
  error?: string
  /**
   * Set when the update was rejected by optimistic-concurrency: the day was
   * changed elsewhere since it was loaded (`ifRevisionId` mismatch). Distinct
   * from a generic `error` so the router can map it to a 409 CONFLICT and the UI
   * can tell the organizer to reload rather than retry blindly.
   */
  conflict?: boolean
}

/**
 * The set of `talk` document ids belonging to `conferenceId`. The SAVE validator
 * asserts every referenced talk is in this set, rejecting dangling refs (deleted
 * talks) and foreign refs (talks from another edition). Fetched once per save.
 */
export async function getValidTalkIds(
  conferenceId: string,
): Promise<Set<string>> {
  const ids = await scopedFetch<string[]>(
    clientWrite,
    { conferenceId },
    `*[_type == "talk"]._id`,
  )
  return new Set(ids || [])
}

/** Fetch all talk statuses for the Strict Block guard. */
export async function getTalkStatuses(
  conferenceId: string,
): Promise<Record<string, string>> {
  const talks = await scopedFetch<{ _id: string; status?: string }[]>(
    clientWrite,
    { conferenceId },
    `*[_type == "talk"]{ _id, status }`,
  )
  return Object.fromEntries(
    (talks || []).map((t) => [t._id, t.status || 'new']),
  )
}

/** Fetch the current status of a schedule document. */
export async function getScheduleStatusById(
  scheduleId: string,
  conferenceId: string,
): Promise<string | null> {
  // Scoped to the tenant AND the type: this read decides whether a save forks,
  // and an unscoped `*[_id == $id]` answers questions about documents in other
  // conferences. A foreign or unknown id now returns null, which the caller
  // treats as official and therefore forks — the safe direction, and it reveals
  // nothing about whether that id exists elsewhere.
  const doc = await clientWrite.fetch<{ status?: string } | null>(
    `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]{ status }`,
    { id: scheduleId, conferenceId },
  )
  return doc?.status || null
}

/**
 * The referenced talk id on a slot, resolved from either the projected `_id` or
 * a raw Sanity `_ref`. Returns '' when the slot carries no resolvable talk (no
 * `talk` at all, or a malformed `talk` object with neither field) — the caller
 * treats a '' result on a non-placeholder slot as a ghost and drops it, so a
 * `createReference('')` is never serialized.
 */
function resolveTalkId(talk: {
  talk?: { _id?: string | null; _ref?: string | null } | null
}): string {
  return talk.talk?._id || talk.talk?._ref || ''
}

/**
 * Flatten a schedule day's real (non-placeholder, resolvable) talk slots to the
 * placement tuples the schedule-change diff compares. Exported because promote
 * — now the only write that changes the PUBLIC program — has to diff the
 * outgoing official day against the incoming one to alert speakers. Placeholders and ghost
 * slots (no resolvable talk) are skipped — they have no speakers to alert.
 */
export function collectPlacements(
  date: string,
  tracks: ConferenceSchedule['tracks'] | undefined,
): SlotPlacement[] {
  const placements: SlotPlacement[] = []
  const trackList = tracks || []
  for (let trackIndex = 0; trackIndex < trackList.length; trackIndex++) {
    const track = trackList[trackIndex]
    for (const talk of track.talks || []) {
      if (talk.placeholder) continue
      const talkId = resolveTalkId(talk)
      if (!talkId) continue
      placements.push({
        talkId,
        date,
        startTime: talk.startTime,
        trackIndex,
        trackTitle: track.trackTitle,
      })
    }
  }
  return placements
}

/** The raw prior-schedule projection used to diff talk placements on save. */
interface PriorScheduleSlots {
  date: string | null
  tracks:
    | {
        trackTitle: string | null
        talks: { startTime: string | null; talkId: string | null }[] | null
      }[]
    | null
}

/**
 * Fetch the CURRENT persisted placements of a schedule day (before it is
 * overwritten), so the save can diff moved talks afterwards. Best-effort and
 * never a save failure.
 *
 * RETURN: the placements on success (an empty array for a genuinely empty/new
 * day), or `null` when the READ ITSELF FAILED. The distinction matters: a failed
 * read is NOT the same as an empty day. If it silently returned `[]`, the diff
 * would treat every current talk as "newly placed" and announce NOTHING — so a
 * real move during a transient read failure would go out unannounced with no
 * trace. The caller SKIPS the alert pass (and logs) when this is `null`, rather
 * than diffing against a bogus empty baseline.
 */
async function fetchPriorPlacements(
  scheduleId: string,
): Promise<SlotPlacement[] | null> {
  try {
    const doc = await clientWrite.fetch<PriorScheduleSlots | null>(
      `*[_id == $id][0]{
        date,
        tracks[]{
          trackTitle,
          "talks": talks[defined(talk)]{ startTime, "talkId": talk._ref }
        }
      }`,
      { id: scheduleId },
    )
    if (!doc?.date) return []
    const placements: SlotPlacement[] = []
    const trackList = doc.tracks || []
    for (let trackIndex = 0; trackIndex < trackList.length; trackIndex++) {
      const track = trackList[trackIndex]
      for (const slot of track.talks || []) {
        if (!slot.talkId || !slot.startTime) continue
        placements.push({
          talkId: slot.talkId,
          date: doc.date,
          startTime: slot.startTime,
          trackIndex,
          trackTitle: track.trackTitle || '',
        })
      }
    }
    return placements
  } catch (error) {
    // Read failure — return the null sentinel so the caller skips (not misfires)
    // the schedule-change alert pass. Never rethrow: the save must not fail.
    console.error('Failed to read prior schedule placements:', error)
    return null
  }
}

/** True when a Sanity write failed because `ifRevisionId` did not match (409). */
function isRevisionMismatch(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number })?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision') && message.includes('mismatch')
}

export async function saveScheduleToSanity(
  schedule: ConferenceSchedule,
  conference: Conference,
  options?: { actorId?: string },
): Promise<SaveScheduleResult> {
  try {
    // Compact save log — the full payload used to be dumped every save, leaking
    // the entire schedule into logs. Log only what's useful for tracing a write.
    const slotCount = (schedule.tracks || []).reduce(
      (n, track) => n + (track.talks?.length || 0),
      0,
    )
    console.log(
      `Saving schedule ${schedule._id || '(new)'} date=${schedule.date} tracks=${(schedule.tracks || []).length} slots=${slotCount}`,
    )

    const sanitizedTracks = (schedule.tracks || []).map(
      (track, trackIndex) => ({
        _key: generateKey(`track-${trackIndex}`),
        trackTitle: track.trackTitle,
        trackDescription: track.trackDescription,
        // Drop ghost slots before serializing — otherwise the talk branch below
        // emits an empty `{_ref:''}` that `validateSchedulePayload` rejects,
        // failing the whole save. A ghost is a slot that is neither a placeholder
        // NOR a resolvable talk: `resolveTalkId` returns '' for a slot with no
        // talk at all AND for a malformed `talk` object carrying neither `_id`
        // nor `_ref`. The editor load path is already ghost-free
        // (`toEditorSchedule`), but this filter is NOT redundant: the tRPC save
        // path also accepts client-supplied payloads that never crossed the load
        // boundary, so keep it.
        talks: (track.talks || [])
          .filter((talk) => talk.placeholder || resolveTalkId(talk) !== '')
          .map((talk, talkIndex) => {
            const baseKey = `talk-${trackIndex}-${talkIndex}-${talk.startTime.replace(':', '')}`

            if (talk.placeholder) {
              return {
                _key: generateKey(`${baseKey}-service`),
                placeholder: talk.placeholder,
                startTime: talk.startTime,
                endTime: talk.endTime,
              }
            }

            // The filter above guarantees a resolvable talk id (non-empty) reaches
            // this point, so this is the exhaustive final case — no empty ref.
            const talkId = resolveTalkId(talk)
            return {
              _key: generateKey(`${baseKey}-${talkId}`),
              talk: createReference(talkId),
              startTime: talk.startTime,
              endTime: talk.endTime,
            }
          }),
      }),
    )

    let savedSchedule: ConferenceSchedule

    if (schedule._id && schedule._id !== '') {
      // An UPDATE without a revision would patch UNCONDITIONALLY — a silent
      // last-write-wins that clobbers a concurrent organizer's edit. The editor
      // always loads `_rev` (projected on load), so a missing one means a
      // malformed or hostile payload: reject it rather than degrade to LWW.
      if (!schedule._rev) {
        return {
          error:
            'Missing revision for this update — reload the day and try again.',
        }
      }

      // SECURITY: `schedule._id` comes from the client, and `isOrganizer` is
      // global across every edition (an organizer of conference A is an
      // organizer on all domains). Without a scope check, a request could patch
      // ANOTHER conference's schedule — or any document id at all — overwriting
      // its `date`/`tracks`. Confirm the target is a `schedule` belonging to the
      // conference being served before writing.
      const target = await clientWrite.fetch<{
        _type: string
        conferenceRef: string | null
        status: string | null
      } | null>(
        `*[_id == $id][0]{ _type, "conferenceRef": conference._ref, status }`,
        {
          id: schedule._id,
        },
      )

      // One generic message for missing, wrong-type, and wrong-conference so a
      // caller can't probe whether an arbitrary document id exists.
      if (
        !target ||
        target._type !== 'schedule' ||
        target.conferenceRef !== conference._id
      ) {
        return { error: 'Schedule not found or not accessible' }
      }

      // ALERT GATE: only the OFFICIAL day is public, so only it may notify
      // speakers. The editor autosaves a draft every few seconds, so alerting on
      // a draft would spam every speaker a "your talk moved to …" message for
      // each drag of a day nobody can see yet; an ARCHIVED day is a superseded
      // snapshot and equally must stay silent.
      //
      // The gate reads the PERSISTED status of the document being written, never
      // `schedule.status` from the payload: that field is client-supplied, so a
      // crafted (or merely stale) payload could otherwise force alerts from a
      // private draft — or silence them on the real program.
      //
      // Legacy schedules written before drafts existed carry NO `status`; treat a
      // missing one as official (same fallback as `getScheduleData`), otherwise
      // every pre-existing conference would go silent.
      const notifiesSpeakers =
        !target.status || target.status === ScheduleStatus.Official

      // Capture the CURRENT placements before the overwrite so we can alert
      // speakers whose talk genuinely moved (see `notifyScheduleChanges` after
      // the commit). Best-effort — never blocks or fails the save. Skipped
      // entirely for a non-official day: nothing will be sent, so nothing needs
      // to be read.
      const priorPlacements = notifiesSpeakers
        ? await fetchPriorPlacements(schedule._id)
        : null

      // Optimistic concurrency: `_rev` is guaranteed present (rejected above),
      // so ALWAYS patch with `ifRevisionId` — a save is rejected if the day
      // changed since it was loaded (two organizers editing the same day).
      // Sanity throws a 409 on mismatch, which we surface as a distinct
      // `conflict` result. The commit returns the persisted document, so we
      // thread the NEW `_rev` back to the client — a second save in the same
      // session then isn't a false conflict.
      const committed = await clientWrite
        .patch(schedule._id)
        .ifRevisionId(schedule._rev)
        .set({
          date: schedule.date,
          tracks: sanitizedTracks,
          // `status` is deliberately NOT written here. Promotion is the only
          // legitimate status transition, and it owns the archive + reference
          // swap that has to happen with it. Honouring a client-supplied status
          // on save let a crafted payload flip a draft to official without
          // archiving the day's existing official (two official days), or
          // archive the live day while it stayed referenced by the conference.
          version: (schedule.version || 0) + 1,
        })
        .commit()

      savedSchedule = { ...schedule, _rev: committed._rev }

      // SCHEDULE-CHANGE ALERTS: diff prior vs saved placements and notify the
      // speakers of any talk whose slot actually moved. Never-throw (a failure
      // here must not fail the already-committed save); a run where nothing
      // moved emits nothing. A draft/archived day never reaches this pass at all
      // (see the alert gate above).
      //
      // A `null` prior on an official day means the pre-save read FAILED
      // (distinct from an empty day): diffing against an empty baseline would
      // treat every talk as newly placed and announce nothing, silently
      // swallowing any real move. Skip the pass entirely and log so the miss is
      // observable, rather than misfire.
      if (notifiesSpeakers && priorPlacements === null) {
        console.warn(
          `Skipping schedule-change alerts for ${schedule._id}: prior placements unavailable (read failed)`,
        )
      } else if (notifiesSpeakers && priorPlacements) {
        await notifyScheduleChanges({
          prior: priorPlacements,
          next: collectPlacements(schedule.date, schedule.tracks),
          conferenceId: conference._id,
          actorId: options?.actorId,
        })
      }
    } else {
      // DUPLICATE-DAY GUARD: any payload with `_id: ''` creates a fresh schedule
      // doc and appends it to `conference.schedules`. Two organizers saving the
      // same fabricated empty day — or a client retry after a lost response —
      // would each create a doc for one date, producing duplicate day tabs and
      // forked edits. Check for an existing schedule for this (conference, date)
      // first; if one exists, surface the same conflict UX as a revision mismatch
      // so the client tells the organizer to reload rather than fork the day.
      // Check for an existing schedule for this (conference, date, status)
      // so we don't block drafting if an official day exists.
      const existingId = await scopedFetch<string | null>(
        clientWrite,
        { conferenceId: conference._id },
        `*[_type == "schedule" && date == $date && status == $status][0]._id`,
        { date: schedule.date, status: schedule.status || 'draft' },
      )
      if (existingId) {
        return {
          conflict: true,
          error:
            'A schedule for this date was just created — reload to continue.',
        }
      }

      // Pre-generate the id so the create and the conference-link append run in
      // ONE atomic transaction. Previously these were two sequential writes: if
      // the append failed after the create succeeded, the error was swallowed
      // and the client never learned the new id — orphaning the created
      // schedule and creating a duplicate on the next save.
      const newId = randomUUID()
      const newScheduleDoc = {
        _id: newId,
        _type: 'schedule',
        date: schedule.date,
        tracks: sanitizedTracks,
        conference: createReference(conference._id),
        status: schedule.status || 'draft',
        version: schedule.version || 1,
        ...(options?.actorId
          ? { owner: createReference(options.actorId) }
          : {}),
      }

      const tx = clientWrite.transaction().create(newScheduleDoc)

      // CRITICAL DECOUPLING: Only append Official schedules to the reference array.
      if (schedule.status === 'official') {
        tx.patch(conference._id, (patch) =>
          patch
            .setIfMissing({ schedules: [] })
            .append('schedules', [createReferenceWithKey(newId, 'schedule')]),
        )
      }

      await tx.commit()

      // Read back the created document's `_rev` so a follow-up save in the same
      // session carries a revision and participates in optimistic concurrency
      // (rather than always taking the unconditional-write path).
      const created = await clientWrite.fetch<{ _rev: string } | null>(
        `*[_id == $id][0]{ _rev }`,
        { id: newId },
      )

      savedSchedule = {
        ...schedule,
        _id: newId,
        _rev: created?._rev,
      }
    }

    console.log('Schedule saved successfully:', savedSchedule._id)

    return { schedule: savedSchedule }
  } catch (error) {
    if (isRevisionMismatch(error)) {
      console.warn('Schedule save conflict (stale revision):', schedule._id)
      return {
        conflict: true,
        error: 'This day was changed elsewhere since you loaded it.',
      }
    }
    console.error('Error saving schedule to Sanity:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to save schedule',
    }
  }
}
