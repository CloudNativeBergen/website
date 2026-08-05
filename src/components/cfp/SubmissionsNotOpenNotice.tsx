import Link from 'next/link'

/**
 * Shown on the public CFP page IN PLACE OF the "Submit your proposal" button
 * when the conference is missing something a proposal cannot be submitted
 * without — a session format, or a topic to tag it with (`canAcceptProposals`).
 *
 * Both pickers on the submit form are populated purely from the conference's
 * own lists, so a CTA here would lead a speaker to an empty dropdown over a
 * required field. Provisioning seeds starter formats but deliberately leaves
 * topics to the organizer, so a freshly provisioned tenant lands here until
 * they pick some — see `@/lib/onboarding/create.ts`.
 *
 * Copy names no particular field on purpose: a speaker cannot act on "topics
 * are missing", and the organizer reads the activation checklist, not this.
 */
export function SubmissionsNotOpenNotice({
  contactEmail,
}: {
  /** CFP or general contact address; omitted → the offer to email is dropped. */
  contactEmail?: string
}) {
  return (
    <div
      role="status"
      className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <h2 className="font-space-grotesk text-lg font-semibold text-amber-900 dark:text-amber-200">
        Submissions are not open yet
      </h2>
      <p className="font-inter mt-2 text-base text-amber-800 dark:text-amber-300">
        The organizers are still putting the call for presentations together.
        Please check back soon
        {contactEmail ? (
          <>
            , or reach out to{' '}
            <Link
              href={`mailto:${contactEmail}`}
              className="underline hover:no-underline"
            >
              {contactEmail}
            </Link>{' '}
            if you have questions
          </>
        ) : null}
        .
      </p>
    </div>
  )
}
