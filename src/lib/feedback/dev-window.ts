/**
 * LOCAL DEV ONLY. With `FEEDBACK_DEV_OPEN_WINDOW=1` in `.env.local`, `next
 * dev` treats every Feedback Code's window as open on the attendee page
 * (`/f/<code>`), whatever its schedule, so the whole attendee flow (scan,
 * tap, comment, Change answer, Delete my answer) can be tried locally.
 *
 * The answers are REAL: they are written to the dataset the app runs on,
 * which locally is production, and count in the talk's results. Delete them
 * when done (Delete my answer, or Remove on /admin/feedback). Only the
 * attendee page is affected: the speaker's results, the admin page, minting
 * and the summary cron still follow the real window.
 *
 * Inert anywhere but `next dev`: `NODE_ENV` is `production` in every build
 * (Vercel included, and a local `next start`) and `test` in tests.
 */
export function devOpenWindow(talkId: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false
  if (process.env.FEEDBACK_DEV_OPEN_WINDOW !== '1') return false
  console.warn(
    `[feedback] FEEDBACK_DEV_OPEN_WINDOW: the window of ${talkId} is treated as open (local dev only; answers are real)`,
  )
  return true
}
