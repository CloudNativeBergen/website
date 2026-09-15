'use client'

import { CheckBadgeIcon, ClockIcon } from '@heroicons/react/24/solid'
import {
  MinusCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { formatDateSafe } from '@/lib/time'
import type { SpeakerTicketStatus } from '@/lib/tickets/speakerStatus'

/**
 * Whether a speaker has claimed their complimentary ticket.
 *
 * "Not invited" and "Invited" are deliberately different badges: one means we
 * never sent it, the other means we sent it and they have not acted. Those need
 * different things from the operator, so they must not share a colour.
 *
 * "Unknown" is the provider being unreachable — it is NOT unredeemed. It shares
 * grey with "Not invited" (neither is an alarm) but carries a dashed outline, so
 * "we never sent it" and "we could not read it" stay apart at a glance.
 */
const PRESENTATION: Record<
  SpeakerTicketStatus['state'],
  {
    label: string
    color: BadgeColor
    icon: React.ComponentType<{ className?: string }>
    className?: string
  }
> = {
  redeemed: { label: 'Claimed', color: 'green', icon: CheckBadgeIcon },
  invited: { label: 'Invited', color: 'yellow', icon: ClockIcon },
  'not-invited': {
    label: 'Not invited',
    color: 'gray',
    icon: MinusCircleIcon,
  },
  unknown: {
    label: 'Unknown',
    color: 'gray',
    icon: QuestionMarkCircleIcon,
    className:
      'border border-dashed border-gray-400 bg-transparent dark:border-gray-500',
  },
}

export function SpeakerTicketBadge({
  status,
}: {
  status?: SpeakerTicketStatus
}) {
  if (!status) {
    return <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
  }

  const { label, color, icon, className } = PRESENTATION[status.state]
  const sentOn = status.invitedAt ? formatDateSafe(status.invitedAt) : null

  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <span
        title={
          status.state === 'unknown'
            ? 'Ticket provider unavailable — claim status could not be read'
            : sentOn
              ? `Invitation sent ${sentOn}`
              : undefined
        }
      >
        <StatusBadge
          label={label}
          color={color}
          icon={icon}
          className={`whitespace-nowrap ${className ?? ''}`}
        />
      </span>
      {status.state === 'invited' && sentOn && (
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">
          Sent {sentOn}
        </span>
      )}
    </div>
  )
}
