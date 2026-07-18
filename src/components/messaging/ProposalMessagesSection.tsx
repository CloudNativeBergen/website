'use client'

import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { ConversationThread } from './ConversationThread'

export interface ProposalMessagesSectionProps {
  proposalId: string
  /** The viewer's audience — organizer (admin) or speaker (cfp). */
  audience: 'speaker' | 'organizer'
}

/**
 * The "Messages" card mounted on both proposal detail pages, anchored
 * `#messages` so the notification/email deep links (…/#messages) scroll here.
 * Renders {@link ConversationThread} for the proposal's (deterministic) thread;
 * the composer shows even before the thread exists — the first message creates
 * it (see the router's `proposalId` entry point).
 */
export function ProposalMessagesSection({
  proposalId,
  audience,
}: ProposalMessagesSectionProps) {
  return (
    <section
      id="messages"
      aria-labelledby="proposal-messages-heading"
      className="scroll-mt-20 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-3 flex items-center gap-2">
        <ChatBubbleLeftRightIcon
          className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400"
          aria-hidden="true"
        />
        <h2
          id="proposal-messages-heading"
          className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white"
        >
          Messages
        </h2>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {audience === 'organizer'
          ? 'Private thread with the speaker(s) on this proposal.'
          : 'Private thread with the organizers about this proposal.'}
      </p>
      <ConversationThread proposalId={proposalId} audience={audience} />
    </section>
  )
}
