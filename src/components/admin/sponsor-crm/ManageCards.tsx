'use client'

import {
  PaperAirplaneIcon,
  DocumentTextIcon,
  UserGroupIcon,
  PhotoIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { SponsorSubView } from './form/deal-status'

type DotTone = 'green' | 'blue' | 'amber' | null

interface ManageCard {
  /** Stable React key; a sub-view card uses its view name. */
  key: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  status: string
  dot: DotTone
  /** Pulse the dot when the card is calling for action (e.g. ready to send). */
  pulse?: boolean
  onSelect: () => void
}

const DOT_CLASSES: Record<Exclude<DotTone, null>, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
}

/** Contract card status line + dot, derived from contract & signature state. */
function contractCard(
  sponsor: SponsorForConferenceExpanded,
  onOpen: (view: SponsorSubView) => void,
): ManageCard {
  const base = {
    key: 'contract',
    label: 'Contract',
    icon: DocumentTextIcon,
    onSelect: () => onOpen('contract'),
  }
  switch (sponsor.contractStatus) {
    case 'contract-signed':
      return { ...base, status: 'Signed', dot: 'green' }
    case 'contract-sent':
      return { ...base, status: 'Sent · awaiting signature', dot: 'blue' }
    case 'registration-sent':
      return sponsor.registrationComplete
        ? { ...base, status: 'Ready to send', dot: 'amber', pulse: true }
        : { ...base, status: 'Registration sent', dot: 'blue' }
    case 'verbal-agreement':
      return { ...base, status: 'Verbal agreement', dot: null }
    default:
      return sponsor.registrationComplete
        ? { ...base, status: 'Ready to send', dot: 'amber', pulse: true }
        : { ...base, status: 'Not started', dot: null }
  }
}

interface ManageCardsProps {
  sponsor: SponsorForConferenceExpanded
  hasLogo: boolean
  onOpen: (view: SponsorSubView) => void
  /** Which cards to show, in this order. */
  views: SponsorSubView[]
}

/**
 * Entry points to the focused sub-views (contract, contacts, logo, history,
 * messages, communications). Each is a labeled card with a plain-language
 * status line and an optional coloured dot.
 */
export function ManageCards({
  sponsor,
  hasLogo,
  onOpen,
  views,
}: ManageCardsProps) {
  const contactCount = sponsor.contactPersons?.length ?? 0
  const activityCount = sponsor.activityCount ?? 0

  const allCards: ManageCard[] = [
    contractCard(sponsor, onOpen),
    {
      key: 'contacts',
      label: 'Contacts',
      icon: UserGroupIcon,
      status: contactCount > 0 ? `${contactCount} on record` : 'None yet',
      dot: contactCount > 0 ? null : 'amber',
      onSelect: () => onOpen('contacts'),
    },
    {
      key: 'logo',
      label: 'Logo',
      icon: PhotoIcon,
      status: hasLogo ? 'Uploaded' : 'Missing',
      dot: hasLogo ? null : 'amber',
      onSelect: () => onOpen('logo'),
    },
    {
      key: 'history',
      label: 'History',
      icon: ClockIcon,
      status: activityCount > 0 ? `${activityCount} events` : 'View activity',
      dot: null,
      onSelect: () => onOpen('history'),
    },
    {
      // Sponsor↔organizer message thread (messaging G2b).
      key: 'messages',
      label: 'Messages',
      icon: ChatBubbleLeftRightIcon,
      status: 'Open thread',
      dot: null,
      onSelect: () => onOpen('messages'),
    },
    // The send audit (#1261): emails sent to this sponsor from the CRM's Send
    // action (the other senders join it in #1262–#1264).
    {
      key: 'communications',
      label: 'Communications',
      icon: PaperAirplaneIcon,
      status: 'Emails sent from the CRM',
      dot: null,
      onSelect: () => onOpen('communications'),
    },
  ]
  const cards = allCards.filter((card) =>
    views.includes(card.key as SponsorSubView),
  )
  cards.sort(
    (a, b) =>
      views.indexOf(a.key as SponsorSubView) -
      views.indexOf(b.key as SponsorSubView),
  )

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onSelect}
            className="group relative flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-indigo-500/50 dark:hover:bg-gray-700/60 dark:focus-visible:outline-indigo-400"
          >
            {card.dot && (
              <span
                className={clsx(
                  'absolute top-2.5 right-2.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-gray-900',
                  DOT_CLASSES[card.dot],
                  card.pulse && 'animate-pulse',
                )}
              />
            )}
            <card.icon className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 dark:text-gray-500 dark:group-hover:text-indigo-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {card.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {card.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
