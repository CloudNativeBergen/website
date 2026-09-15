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

/**
 * The row action offered for each state, or `null` for the states where there
 * is nothing honest to offer.
 *
 * "Claimed" is done. "Unknown" means the provider could not be read, so we do
 * not know whether an invitation is needed — inviting on a guess mails a
 * speaker who may already hold their ticket. Gating lives here, in one place,
 * so the desktop table and the mobile card cannot drift apart.
 */
const ACTION_LABEL: Record<SpeakerTicketStatus['state'], string | null> = {
  redeemed: null,
  unknown: null,
  'not-invited': 'Send invitation',
  invited: 'Send again',
}

export function SpeakerTicketBadge({
  status,
  loading = false,
  onSendInvitation,
  sending = false,
  unavailableReason,
}: {
  status?: SpeakerTicketStatus
  /** The status read is still in flight — say so rather than showing "-". */
  loading?: boolean
  /** Offer the row action. Omitted by callers that cannot issue invitations. */
  onSendInvitation?: (speakerId: string) => void
  /** This speaker's invitation is in flight. */
  sending?: boolean
  /**
   * Why sending is impossible right now, in the organizer's words. Set, the
   * row shows this sentence WHERE the action would have been, instead of a
   * button that only fails when pressed — a disabled control with no reason is
   * the thing being replaced here.
   */
  unavailableReason?: string
}) {
  if (!status) {
    return loading ? (
      <span className="animate-pulse text-xs text-gray-500 dark:text-gray-400">
        Checking&hellip;
      </span>
    ) : (
      <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
    )
  }

  const { label, color, icon, className } = PRESENTATION[status.state]
  const sentOn = status.invitedAt ? formatDateSafe(status.invitedAt) : null
  const actionLabel = onSendInvitation ? ACTION_LABEL[status.state] : null

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
      {actionLabel && unavailableReason && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {unavailableReason}
        </span>
      )}
      {actionLabel && !unavailableReason && (
        <button
          type="button"
          onClick={() => onSendInvitation?.(status.speakerId)}
          disabled={sending}
          className="rounded text-xs font-medium text-brand-cloud-blue underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 dark:text-indigo-400"
        >
          {sending ? 'Sending…' : actionLabel}
        </button>
      )}
    </div>
  )
}
