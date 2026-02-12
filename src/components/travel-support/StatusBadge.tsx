import { TravelSupportStatus } from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'
import {
  StatusBadge as BaseStatusBadge,
  type BadgeColor,
} from '@/components/StatusBadge'

interface StatusBadgeProps {
  status: TravelSupportStatus
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const displayName = TravelSupportService.getStatusDisplayName(status)
  const color = TravelSupportService.getStatusColor(status) as BadgeColor

  return (
    <BaseStatusBadge label={displayName} color={color} className={className} />
  )
}
