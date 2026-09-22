import type { Speaker, SpeakerInput } from '@/lib/speaker/types'

/**
 * WHICH speaker record the proposal editor is opened with.
 *
 * `/cfp/proposal/[id]/page.tsx` fetches the signed-in speaker separately AND
 * receives the proposal's own `speakers[]`, then prefers the matching entry
 * from the proposal so the form shows the record attached to it. That choice
 * used to live inline, which is how #1148 broke here twice over: the proposal's
 * projection deliberately withholds OTHER speakers' tag opt-out, and the entry
 * this function returns is the one whose `socialTagOptOut` the editor renders.
 * Nothing pinned the two together, so a projection change could silently make
 * an opted-out speaker look un-opted-out in their own editor.
 *
 * Extracted so that coupling is a seam a test can stand on.
 *
 * @param proposalSpeakers the proposal's `speakers[]`, as projected
 * @param currentUserSpeaker the signed-in speaker, read whole by `getSpeaker`
 * @param sessionSpeakerId the signed-in speaker's id
 */
export function resolveEditorSpeaker(
  proposalSpeakers: unknown,
  currentUserSpeaker: SpeakerInput,
  sessionSpeakerId: string,
): SpeakerInput {
  if (!Array.isArray(proposalSpeakers)) return currentUserSpeaker

  const own = proposalSpeakers.find(
    (s): s is Speaker =>
      typeof s === 'object' &&
      s !== null &&
      '_id' in s &&
      s._id === sessionSpeakerId,
  )
  if (!own) return currentUserSpeaker

  return {
    ...own,
    /**
     * THE OWN-VALUE OVERRIDE, and the reason this function exists.
     *
     * A multi-speaker payload has to withhold other people's opt-out while
     * still telling THIS speaker their own — the same field serving opposite
     * audiences. The projection does that per row, but the editor must not
     * depend on it silently: if that projection is ever narrowed again, a
     * `null`/`undefined` here would render an opted-out speaker's checkbox
     * unticked, and the control would quietly stop reflecting the truth.
     *
     * `currentUserSpeaker` comes from `getSpeaker`, an unprojected read of the
     * caller's own document, so it is the authority for the caller's own
     * preference. Coalescing to it makes the editor correct whether or not the
     * proposal payload carries the value.
     */
    socialTagOptOut:
      own.socialTagOptOut ?? currentUserSpeaker.socialTagOptOut ?? undefined,
  }
}
