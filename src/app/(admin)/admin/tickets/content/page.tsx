import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { TicketPageContentEditor } from '@/components/admin/TicketPageContentEditor'
import {
  DocumentTextIcon,
  TicketIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

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
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<DocumentTextIcon />}
        title="Ticket Page Content"
        description="Configure the public tickets page for"
        contextHighlight={conference.title}
        stats={[]}
        actions={
          <div className="flex space-x-3">
            <Link
              href="/admin/tickets"
              className="inline-flex items-center rounded-lg bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 dark:bg-gray-500 dark:hover:bg-gray-400"
            >
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Back to Tickets
            </Link>
            <Link
              href="/tickets"
              target="_blank"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <TicketIcon className="mr-2 h-4 w-4" />
              View Public Page
            </Link>
          </div>
        }
      />

      <TicketPageContentEditor
        conferenceId={conference._id}
        initialCustomization={conference.ticket_customization ?? {}}
        initialInclusions={conference.ticket_inclusions ?? []}
        initialFaqs={conference.ticket_faqs ?? []}
        vanityMetrics={conference.vanity_metrics ?? []}
      />
    </div>
  )
}
