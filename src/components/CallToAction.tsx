import { Button } from '@/components/Button'
import { MicrophoneIcon, TicketIcon } from '@heroicons/react/24/outline'

interface CallToActionProps {
  /** Whether this is for organizers context (affects messaging and button visibility) */
  isOrganizers?: boolean
  /** Custom title override */
  title?: string
  /** Custom description override */
  description?: string
  /** Whether to show the speaker submission button */
  showSpeakerSubmission?: boolean
  /** Whether to show the ticket reservation button */
  showTicketReservation?: boolean
}

/**
 * Call to Action component for encouraging speaker submissions and ticket reservations.
 * Can be used in different contexts with customizable messaging and button visibility.
 */
export function CallToAction({
  isOrganizers = false,
  title,
  description,
  showSpeakerSubmission = !isOrganizers,
  showTicketReservation = true,
}: CallToActionProps) {
  const defaultTitle = isOrganizers
    ? 'Join Our Community'
    : 'Ready to Join the Cloud Native Journey?'

  const defaultDescription = isOrganizers
    ? "Whether you're looking to share your expertise or learn from the best, we'd love to have you at Cloud Native Bergen."
    : "Don't miss this opportunity to learn from industry experts and connect with the Bergen cloud native community."

  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-cloud-blue/10 to-brand-fresh-green/10 p-8 md:p-12">
      <div className="text-center">
        <h2 className="font-space-grotesk mb-4 text-2xl font-bold text-brand-slate-gray md:text-3xl">
          {title || defaultTitle}
        </h2>
        <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-brand-slate-gray">
          {description || defaultDescription}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          {showSpeakerSubmission && (
            <Button
              href="/cfp"
              variant="primary"
              className="group inline-flex items-center space-x-2 px-8 py-4 font-semibold"
              aria-label="Submit your conference talk proposal"
            >
              <MicrophoneIcon className="h-5 w-5" aria-hidden="true" />
              <span>Submit Your Talk</span>
            </Button>
          )}

          {showTicketReservation && (
            <Button
              href="/tickets"
              variant={isOrganizers ? 'primary' : 'outline'}
              className="group inline-flex items-center space-x-2 px-8 py-4 font-semibold"
              aria-label="Reserve your conference ticket"
            >
              <TicketIcon className="h-5 w-5" aria-hidden="true" />
              <span>Reserve Your Ticket</span>
            </Button>
          )}
        </div>

        {showSpeakerSubmission && !isOrganizers && (
          <p className="font-inter mt-6 text-sm text-brand-slate-gray/80">
            Speaking applications close soon. Secure your spot today!
          </p>
        )}
      </div>
    </div>
  )
}
