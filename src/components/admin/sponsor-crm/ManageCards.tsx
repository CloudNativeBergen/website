'use client'

import {
  DocumentTextIcon,
  UserGroupIcon,
  PhotoIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { SponsorSubView } from './form/deal-status'

type DotTone = 'green' | 'blue' | 'amber' | null

interface ManageCard {
  view: SponsorSubView
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  status: string
  dot: DotTone
  /** Pulse the dot when the card is calling for action (e.g. ready to send). */
  pulse?: boolean
}

const DOT_CLASSES: Record<Exclude<DotTone, null>, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
}

/** Contract card status line + dot, derived from contract & signature state. */
function contractCard(sponsor: SponsorForConferenceExpanded): ManageCard {
  const base = {
    view: 'contract' as const,
    label: 'Contract',
    icon: DocumentTextIcon,
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
}

/**
 * Entry points to the focused sub-views (contract workflow, contacts/billing,
 * logo, history). Each is a labeled card with a plain-language status line and
 * an optional coloured dot as a secondary signal — replacing the row of
 * caption-less icon buttons whose only state was a cryptic corner dot.
 */
export function ManageCards({ sponsor, hasLogo, onOpen }: ManageCardsProps) {
  const contactCount = sponsor.contactPersons?.length ?? 0
  const activityCount = sponsor.activityCount ?? 0

  const cards: ManageCard[] = [
    contractCard(sponsor),
    {
      view: 'contacts',
      label: 'Contacts',
      icon: UserGroupIcon,
      status: contactCount > 0 ? `${contactCount} on record` : 'None yet',
      dot: contactCount > 0 ? null : 'amber',
    },
    {
      view: 'logo',
      label: 'Logo',
      icon: PhotoIcon,
      status: hasLogo ? 'Uploaded' : 'Missing',
      dot: hasLogo ? null : 'amber',
    },
    {
      view: 'history',
      label: 'History',
      icon: ClockIcon,
      status: activityCount > 0 ? `${activityCount} events` : 'View activity',
      dot: null,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.view}
          type="button"
          onClick={() => onOpen(card.view)}
          className="group relative flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-white dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-indigo-500/50 dark:hover:bg-gray-800"
        >
          {card.dot && (
            <span
              className={clsx(
                'absolute top-2.5 right-2.5 h-2 w-2 rounded-full ring-2 ring-gray-50 dark:ring-gray-800',
                DOT_CLASSES[card.dot],
                card.pulse && 'animate-pulse',
              )}
            />
          )}
          <card.icon className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 dark:text-gray-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {card.label}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {card.status}
          </span>
        </button>
      ))}
    </div>
  )
}
