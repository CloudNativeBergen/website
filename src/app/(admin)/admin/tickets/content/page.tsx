import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { TicketPageContentEditor } from '@/components/admin/TicketPageContentEditor'

export default async function TicketContentAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Conference Error"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <TicketPageContentEditor
        conferenceId={conference._id}
        conferenceTitle={conference.title}
        initialCustomization={conference.ticket_customization ?? {}}
        initialInclusions={conference.ticket_inclusions ?? []}
        initialFaqs={conference.ticket_faqs ?? []}
        vanityMetrics={conference.vanity_metrics ?? []}
      />
    </div>
  )
}
