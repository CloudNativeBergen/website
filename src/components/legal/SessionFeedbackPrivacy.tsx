import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline'
import { DEVICE_COOKIE_DAYS } from '@/lib/feedback'

/**
 * Session Feedback on /privacy (speaker feedback spec §8): what the QR code on
 * a session collects, for EVERY tenant, since any conference can print one.
 * "Your rights" (deleting your own answer) is added with Delete my answer
 * (F2). The cookie's lifetime comes from `src/lib/feedback/device.ts`.
 */
export function SessionFeedbackPrivacy() {
  return (
    <div
      id="session-feedback"
      className="rounded-lg border border-lime-200 bg-lime-50 p-6 dark:border-lime-800 dark:bg-lime-900/20"
    >
      <h3 className="mb-4 flex items-center text-lg font-semibold text-lime-800 dark:text-lime-200">
        <ChatBubbleBottomCenterTextIcon className="mr-3 size-5" />
        Session Feedback
      </h3>
      <ul className="space-y-2 text-sm text-lime-800 dark:text-lime-200">
        <li>
          <strong>What:</strong> a colour (Loved it, It was OK or Not for me)
          and an optional comment about a session, given anonymously by scanning
          its QR code. No name, email or IP address is collected.
        </li>
        <li>
          <strong>Cookie:</strong> a strictly necessary cookie, used only on the
          feedback pages and kept for {DEVICE_COOKIE_DAYS} days after your last
          answer, so you can change your own answer and so answers aren&apos;t
          counted twice. No consent prompt.
        </li>
        <li>
          <strong>Who sees it:</strong> the session&apos;s speakers see the
          totals and the comments; organizers see everything and can hide or
          remove comments.
        </li>
        <li>
          <strong>Purpose and legal basis:</strong> helping speakers and
          organizers improve sessions; legitimate interest.
        </li>
        <li>
          <strong>Retention:</strong> 24 months after the conference ends; then
          comments and individual answers are deleted and only per-session
          totals remain.
        </li>
        <li>
          <strong>Processors:</strong> Sanity (storage) and Resend (summary
          emails to speakers), both listed in section 5. No other processor.
        </li>
      </ul>
    </div>
  )
}

/** The feedback cookie in the cookies section's inventory, for every tenant. */
export function SessionFeedbackCookieNote() {
  return (
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      <strong>Session feedback:</strong> If you answer a session&apos;s feedback
      QR code, this site sets one strictly necessary cookie, sent only to the
      feedback pages. It holds a random identifier for your browser and which
      sessions you have answered (as unreadable codes, not their names), nothing
      about you. It is how you can change your own answer, and it expires{' '}
      {DEVICE_COOKIE_DAYS} days after your last answer. Clearing this
      site&apos;s cookies removes it.
    </p>
  )
}
