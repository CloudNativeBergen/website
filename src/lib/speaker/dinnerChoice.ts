/**
 * How a speaker gets to the speaker dinner (#1592, phase 5). One
 * `speakerDinnerChoice` document per speaker per conference, off the
 * conference document because speakers write it. The RSVP itself stays on the
 * speaker ticket.
 */
import type { SpeakerInfoRoute } from '@/lib/conference/types'

export const DINNER_OWN = 'own'
export const DINNER_NOT_COMING = 'not-coming'
/** Summary row for a stored route `_key` that is no longer offered. `~` never appears in a generated key. */
export const DINNER_REMOVED_ROUTE = '~removed-route'

export const dinnerChoiceId = (conferenceId: string, speakerId: string) =>
  `dinnerChoice.${conferenceId}.${speakerId}`

export interface DinnerChoiceOption {
  value: string
  label: string
}

/** The conference's current routes, then "own" and "not coming". */
export function dinnerChoiceOptions(
  routes: SpeakerInfoRoute[] | undefined,
): DinnerChoiceOption[] {
  return [
    ...(routes ?? [])
      .filter((r): r is SpeakerInfoRoute & { _key: string } => !!r._key)
      .map((r) => ({ value: r._key, label: r.label || 'Unnamed route' })),
    { value: DINNER_OWN, label: "I'll get there on my own" },
    { value: DINNER_NOT_COMING, label: "I'm not coming to the dinner" },
  ]
}

/**
 * The stored choice when it is still offered, otherwise `null` — a route that
 * was removed or re-keyed reads as unset, so the speaker is asked again.
 */
export function resolveDinnerChoice(
  stored: string | null | undefined,
  routes: SpeakerInfoRoute[] | undefined,
): string | null {
  if (!stored) return null
  return dinnerChoiceOptions(routes).some((o) => o.value === stored)
    ? stored
    : null
}

export interface DinnerChoiceSummaryRow {
  /**
   * A route `_key`, `own`, `not-coming`, {@link DINNER_REMOVED_ROUTE}, or
   * `null` for no answer.
   */
  value: string | null
  label: string
  speakers: { name: string; email?: string }[]
}

/**
 * Count per option, plus "Chose a route that was removed" and "No answer",
 * among the given confirmed speakers.
 */
export function summarizeDinnerChoices(
  routes: SpeakerInfoRoute[] | undefined,
  speakers: ({ _id: string; name?: string; email?: string } | null)[],
  choices: { speakerId: string; choice: string }[],
): DinnerChoiceSummaryRow[] {
  const bySpeaker = new Map(choices.map((c) => [c.speakerId, c.choice]))
  const rows: DinnerChoiceSummaryRow[] = [
    ...dinnerChoiceOptions(routes).map((o) => ({ ...o, speakers: [] })),
    {
      value: DINNER_REMOVED_ROUTE,
      label: 'Chose a route that was removed',
      speakers: [],
    },
    { value: null, label: 'No answer', speakers: [] },
  ]
  // A speaker with two talks is listed once.
  const unique = new Map(
    speakers.flatMap((s) => (s ? [[s._id, s] as const] : [])),
  )
  for (const s of unique.values()) {
    const stored = bySpeaker.get(s._id)
    const choice = resolveDinnerChoice(stored, routes)
    const value = choice ?? (stored ? DINNER_REMOVED_ROUTE : null)
    const row = rows.find((r) => r.value === value)!
    row.speakers.push({ name: s.name || 'Unnamed speaker', email: s.email })
  }
  for (const r of rows) r.speakers.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}
