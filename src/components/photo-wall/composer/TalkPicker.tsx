'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { isScheduleToday } from '@/lib/program/time-utils'
import { formatDateLocalized } from '@/lib/time'
import {
  suggestTalks,
  type TaggableTalk,
} from '@/lib/photo-wall/talk-suggestion'

/** Where the last room chosen is kept for the next post (§6.1). */
export const ROOM_KEY = 'wall-composer-room'

const storedRoom = () => {
  try {
    return sessionStorage.getItem(ROOM_KEY)
  } catch {
    return null
  }
}

const idOf = (t: TaggableTalk) => t.slot.talk?._id ?? ''
const titleOf = (t: TaggableTalk) => t.slot.talk?.title ?? ''

/**
 * The Talk row of the composer (Talk photos spec §6.1): room chips of
 * today's tracks, the running (or recent) talk in that room preselected, a
 * list to pick any other talk, and No talk. Reports the tagged talk's id, or
 * null, through `onChange`. Nothing to tag, no row.
 */
export function TalkPicker({
  schedules,
  now,
  onChange,
}: {
  schedules: ConferenceSchedule[]
  /** Conference time; `suggestTalks` reads the clock when absent. */
  now?: Date
  onChange: (talkId: string | null) => void
}) {
  const rooms = useMemo(
    () =>
      schedules
        .filter((day) => isScheduleToday(day.date, now))
        .flatMap((day) => day.tracks.map((t) => t.trackTitle))
        .filter((room, i, all) => all.indexOf(room) === i),
    [schedules, now],
  )
  // One room is no choice; with more, a stored one only if it is still
  // there today. No room chosen, nothing suggested: untagged by default.
  const [room, setRoom] = useState<string>(() => {
    if (rooms.length === 1) return rooms[0]
    const kept = storedRoom()
    return kept && rooms.includes(kept) ? kept : ''
  })
  const { suggested, options } = useMemo(
    () => suggestTalks(schedules, room, now),
    [schedules, room, now],
  )
  const [talkId, setTalkId] = useState<string | null>(
    suggested ? idOf(suggested) : null,
  )

  useEffect(() => onChange(talkId), [talkId, onChange])

  if (options.length === 0) return null

  const chooseRoom = (next: string) => {
    setRoom(next)
    try {
      sessionStorage.setItem(ROOM_KEY, next)
    } catch {
      // Private mode and the like: the room is just not remembered.
    }
    const s = suggestTalks(schedules, next, now).suggested
    setTalkId(s ? idOf(s) : null)
  }

  const tagged = options.find((t) => idOf(t) === talkId) ?? null
  const groups: { label: string; talks: TaggableTalk[] }[] = []
  for (const t of options) {
    const label = isScheduleToday(t.date, now)
      ? t.room
      : formatDateLocalized(t.date, 'en-GB')
    const last = groups[groups.length - 1]
    if (last?.label === label) last.talks.push(t)
    else groups.push({ label, talks: [t] })
  }

  return (
    <fieldset className="mt-5 min-w-0">
      <legend className="text-sm font-semibold text-gray-900 dark:text-white">
        Talk
      </legend>
      {rooms.length > 1 && (
        <fieldset className="mt-2 min-w-0">
          <legend className="sr-only">Room</legend>
          <div className="flex flex-wrap gap-2">
            {rooms.map((r) => (
              <label key={r} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="wall-room"
                  value={r}
                  checked={r === room}
                  onChange={() => chooseRoom(r)}
                  className="peer sr-only"
                />
                <span className="flex min-h-9 items-center rounded-full px-3 text-sm text-gray-700 ring-1 ring-gray-300 peer-checked:bg-brand-cloud-blue peer-checked:text-white peer-checked:ring-brand-cloud-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gray-900 dark:text-gray-300 dark:ring-gray-600 dark:peer-checked:bg-indigo-500 dark:peer-checked:ring-indigo-500 dark:peer-focus-visible:outline-white">
                  {r}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p
        className="mt-3 text-sm text-gray-700 dark:text-gray-300"
        data-testid="talk-tag"
      >
        {tagged ? (
          <>
            Tag: <span className="font-semibold">{titleOf(tagged)}</span>
            {tagged === suggested && <> (now in {tagged.room})</>}
          </>
        ) : rooms.length > 1 && !room ? (
          'Pick your room to tag the talk, or post without one.'
        ) : (
          'No talk tagged.'
        )}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Change talk</span>
          <select
            value={talkId ?? ''}
            onChange={(e) => setTalkId(e.target.value || null)}
            className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value="">No talk</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.talks.map((t) => (
                  <option key={`${t.date}-${idOf(t)}`} value={idOf(t)}>
                    {t.slot.startTime} {titleOf(t)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {tagged && (
          <button
            type="button"
            onClick={() => setTalkId(null)}
            className="min-h-11 shrink-0 rounded-md px-2 text-sm text-gray-600 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-gray-400 dark:focus-visible:outline-white"
          >
            No talk
          </button>
        )}
      </div>
    </fieldset>
  )
}
