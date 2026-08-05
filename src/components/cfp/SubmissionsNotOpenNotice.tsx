import Link from 'next/link'

/**
 * Shown on the public CFP page IN PLACE OF the "Submit your proposal" button
 * when the conference has not configured a single session format.
 *
 * A proposal must carry a format (`validateProposalForm`) and the submit form
 * only offers the formats the conference configured, so a CTA here would lead
 * a speaker to an empty dropdown. Every freshly provisioned tenant starts in
 * this state — see `@/lib/onboarding/create.ts`.
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
        The organizers are still putting the call for presentations together —
        the session formats have not been announced. Please check back soon
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
