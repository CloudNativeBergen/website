import { Button } from '@/components/Button'
import { MicrophoneIcon, TicketIcon } from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { isRegistrationAvailable } from '@/lib/conference/state'

interface CallToActionProps {
  conference: Conference

  isOrganizers?: boolean

  title?: string

  description?: string

  showSpeakerSubmission?: boolean

  showTicketReservation?: boolean
}

export function CallToAction({
  conference,
  isOrganizers = false,
  title,
  description,
  showSpeakerSubmission = !isOrganizers,
  showTicketReservation = true,
}: CallToActionProps) {
  const defaultTitle = isOrganizers
    ? 'Join Our Community'
    : 'Ready to Join the Cloud Native Journey?'

  const conferenceName = conference.title || conference.organizer
  const defaultDescription = isOrganizers
    ? `Whether you&apos;re looking to share your expertise or learn from the best, we&apos;d love to have you at ${conferenceName}.`
    : `Don&apos;t miss this opportunity to learn from industry experts and connect with the ${conference.city || 'local'} cloud native community.`

  const showTickets =
    showTicketReservation && isRegistrationAvailable(conference)

  // Hide entire component if there are no actions to show
  if (!showSpeakerSubmission && !showTickets) {
    return null
  }

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

          {showTickets && (
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
