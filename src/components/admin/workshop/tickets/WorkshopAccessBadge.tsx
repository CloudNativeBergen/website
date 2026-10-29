import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import type { WorkshopAccess } from '@/lib/tickets/classification'

/**
 * What a ticket type's holders get, as the portal decides it: the three
 * answers of `workshopAccessOf`. Read-only. While no type is marked the answer
 * comes from the built-in list, and the badge says so.
 */
export function WorkshopAccessBadge({
  access,
  configured,
}: {
  /** The rule's answer for this type, resolved on the server. */
  access: WorkshopAccess
  /** Has any type at this conference been marked as granting? */
  configured: boolean
}) {
  const [label, color]: [string, BadgeColor] = !configured
    ? access === 'granted'
      ? ['Grants workshop access (built-in list)', 'blue']
      : ['No workshop access (built-in list)', 'gray']
    : access === 'granted'
      ? ['Grants workshop access', 'green']
      : access === 'denied'
        ? ['No workshop access', 'gray']
        : ['Not set', 'yellow']

  return <StatusBadge label={label} color={color} />
}
