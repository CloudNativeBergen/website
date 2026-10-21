/**
 * What a talk's admin page shows of Session Feedback (speaker feedback spec
 * §10.2). Client-safe and pure: `today` is the Oslo calendar date.
 *
 * - `panel`: the whole panel (totals with Card Counts, the code, responses
 *   over time, comments), once the conference has started, for an accepted
 *   or confirmed talk; the old Card Counts panel's rule.
 * - `code`: only the Feedback Code, for a confirmed talk before that, so a
 *   room's sheet can be printed ahead (#1459).
 * - `null`: nothing.
 */
export function talkFeedbackView({
  status,
  conferenceStartDate,
  today,
  codesLive,
}: {
  status: string
  conferenceStartDate: string | null | undefined
  /** `osloTodayDateString()`: YYYY-MM-DD in Europe/Oslo. */
  today: string
  /** `ATTENDEE_PAGE_LIVE`. */
  codesLive: boolean
}): 'panel' | 'code' | null {
  const started =
    !!conferenceStartDate && today >= conferenceStartDate.slice(0, 10)
  if (started && (status === 'accepted' || status === 'confirmed'))
    return 'panel'
  return codesLive && status === 'confirmed' ? 'code' : null
}
