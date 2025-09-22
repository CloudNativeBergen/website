import { CoSpeakerInvitationFull } from '@/lib/cospeaker/types'
import { getInvitationDisplayStatus } from '@/lib/cospeaker/sanity'
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'

interface InvitationBadgesProps {
  invitations?: CoSpeakerInvitationFull[]
  size?: 'sm' | 'md'
}

export function InvitationBadges({
  invitations,
  size = 'sm',
}: InvitationBadgesProps) {
  if (!invitations || invitations.length === 0) return null

  const invitationsByStatus = invitations.reduce(
    (acc, inv) => {
      const displayStatus = getInvitationDisplayStatus(inv)
      if (!acc[displayStatus]) acc[displayStatus] = []
      acc[displayStatus].push(inv)
      return acc
    },
    {} as Record<string, CoSpeakerInvitationFull[]>,
  )

  const badgeClasses =
    size === 'sm'
      ? 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full'
      : 'inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-full'

  const iconClasses = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Pending invitations */}
      {invitationsByStatus.pending?.length > 0 && (
        <div
          className={`${badgeClasses} bg-brand-sky-mist text-brand-cloud-blue`}
          title={`${invitationsByStatus.pending.length} pending invitation${invitationsByStatus.pending.length > 1 ? 's' : ''}`}
          role="status"
          aria-label={`${invitationsByStatus.pending.length} pending invitation${invitationsByStatus.pending.length > 1 ? 's' : ''}`}
        >
          <ClockIcon className={iconClasses} aria-hidden="true" />
          <span>{invitationsByStatus.pending.length} pending</span>
        </div>
      )}

      {/* Accepted invitations */}
      {invitationsByStatus.accepted?.length > 0 && (
        <div
          className={`${badgeClasses} text-brand-fresh-green-dark bg-brand-fresh-green/10`}
          title={`${invitationsByStatus.accepted.length} accepted invitation${invitationsByStatus.accepted.length > 1 ? 's' : ''}`}
          role="status"
          aria-label={`${invitationsByStatus.accepted.length} accepted invitation${invitationsByStatus.accepted.length > 1 ? 's' : ''}`}
        >
          <CheckCircleIcon className={iconClasses} aria-hidden="true" />
          <span>{invitationsByStatus.accepted.length} accepted</span>
        </div>
      )}

      {/* Declined invitations */}
      {invitationsByStatus.declined?.length > 0 && (
        <div
          className={`${badgeClasses} text-brand-cloud-blue-dark bg-brand-cloud-blue/10`}
          title={`${invitationsByStatus.declined.length} declined invitation${invitationsByStatus.declined.length > 1 ? 's' : ''}`}
          role="status"
          aria-label={`${invitationsByStatus.declined.length} declined invitation${invitationsByStatus.declined.length > 1 ? 's' : ''}`}
        >
          <XCircleIcon className={iconClasses} aria-hidden="true" />
          <span>{invitationsByStatus.declined.length} declined</span>
        </div>
      )}

      {/* Expired invitations */}
      {invitationsByStatus.expired?.length > 0 && (
        <div
          className={`${badgeClasses} text-brand-sunbeam-yellow-dark bg-brand-sunbeam-yellow/20`}
          title={`${invitationsByStatus.expired.length} expired invitation${invitationsByStatus.expired.length > 1 ? 's' : ''}`}
          role="status"
          aria-label={`${invitationsByStatus.expired.length} expired invitation${invitationsByStatus.expired.length > 1 ? 's' : ''}`}
        >
          <ExclamationTriangleIcon className={iconClasses} aria-hidden="true" />
          <span>{invitationsByStatus.expired.length} expired</span>
        </div>
      )}
    </div>
  )
}

interface InvitationStatusListProps {
  invitations?: CoSpeakerInvitationFull[]
}

export function InvitationStatusList({
  invitations,
}: InvitationStatusListProps) {
  if (!invitations || invitations.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-medium tracking-wider text-brand-slate-gray uppercase">
        Co-speaker Invitations
      </h4>
      <div className="space-y-1">
        {invitations.map((invitation) => {
          const displayStatus = getInvitationDisplayStatus(invitation)
          const isExpired = displayStatus === 'expired'

          return (
            <div
              key={invitation._id}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                {displayStatus === 'pending' && !isExpired && (
                  <ClockIcon
                    className="h-4 w-4 text-brand-cloud-blue"
                    aria-hidden="true"
                  />
                )}
                {displayStatus === 'accepted' && (
                  <CheckCircleIcon
                    className="h-4 w-4 text-brand-fresh-green"
                    aria-hidden="true"
                  />
                )}
                {displayStatus === 'declined' && (
                  <XCircleIcon
                    className="text-brand-cloud-blue-dark h-4 w-4"
                    aria-hidden="true"
                  />
                )}
                {isExpired && (
                  <ExclamationTriangleIcon
                    className="text-brand-sunbeam-yellow-dark h-4 w-4"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    isExpired
                      ? 'text-brand-sunbeam-yellow-dark'
                      : 'text-brand-slate-gray'
                  }
                >
                  {invitation.invitedName || invitation.invitedEmail}
                </span>
              </div>
              <span className="text-xs text-brand-slate-gray">
                {isExpired
                  ? 'Expired'
                  : displayStatus === 'pending' && invitation.expiresAt
                    ? `Expires ${formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}`
                    : displayStatus.charAt(0).toUpperCase() +
                      displayStatus.slice(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
