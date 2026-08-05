import Link from 'next/link'

/**
 * Shown on the public `/speaker` page IN PLACE OF the speaker grid when the
 * conference has no accepted speakers yet.
 *
 * The page used to head an empty grid with "Meet our 0 speakers" over a
 * paragraph promising "these industry experts" — which is what every freshly
 * provisioned tenant showed (see `@/lib/onboarding/create.ts`), and what the
 * "View Speakers" button on the `/tickets` coming-soon card linked to. A
 * counted heading only makes sense once there is something to count.
 *
 * The submit link appears only when a proposal could actually be submitted —
 * the CFP window is open AND the conference offers at least one format — so
 * this never sends a speaker to a form they cannot complete.
 */
export function SpeakersNotAnnouncedNotice({
  contactEmail,
  cfpOpen = false,
}: {
  /** General contact address; omitted → the offer to email is dropped. */
  contactEmail?: string
  /** CFP window open AND at least one submittable format configured. */
  cfpOpen?: boolean
}) {
  return (
    <div
      role="status"
      className="mt-10 rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-800 dark:bg-blue-900/20"
    >
      <h2 className="font-space-grotesk text-lg font-semibold text-brand-cloud-blue dark:text-blue-300">
        Speakers have not been announced yet
      </h2>
      <p className="font-inter mt-2 text-base text-brand-slate-gray dark:text-gray-300">
        The programme is still being put together. Speaker profiles will appear
        here as soon as the first talks are confirmed. Check back soon
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
      {cfpOpen && (
        <p className="font-inter mt-4 text-base text-brand-slate-gray dark:text-gray-300">
          Want to be one of them? The{' '}
          <Link href="/cfp" className="underline hover:no-underline">
            call for presentations
          </Link>{' '}
          is open.
        </p>
      )}
    </div>
  )
}
