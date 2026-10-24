import { csvDocument, csvFilename } from '@/lib/csv'
import type { VolunteerTicketStatus } from '@/lib/tickets/volunteerStatus'
import {
  TShirtSize,
  VolunteerStatus,
  type VolunteerWithConference,
} from './types'

const COLUMNS = [
  'Name',
  'Email',
  'Phone',
  'Status',
  'Occupation',
  'T-shirt size',
  'Dietary restrictions',
  'Preferred tasks',
  'Assigned tasks',
  'Availability',
  'Ticket status',
  'Confirmed at',
] as const

const TICKET_LABELS: Record<VolunteerTicketStatus['state'], string> = {
  redeemed: 'Ticket claimed',
  invited: 'Approval email sent',
  'not-invited': 'No approval email',
  unknown: 'Unknown',
}

type Exportable = Pick<
  VolunteerWithConference,
  | '_id'
  | 'name'
  | 'email'
  | 'phone'
  | 'status'
  | 'occupation'
  | 'tshirtSize'
  | 'dietaryRestrictions'
  | 'preferredTasks'
  | 'assignedTasks'
  | 'availability'
  | 'confirmedAt'
>

/** One line per volunteer, in the order given (the filtered list). */
export function buildVolunteersCsv(
  volunteers: Exportable[],
  ticketStatuses: Record<string, Pick<VolunteerTicketStatus, 'state'>>,
): string {
  return csvDocument(
    COLUMNS,
    volunteers.map((v) => {
      const ticket = ticketStatuses[v._id]
      return [
        v.name,
        v.email,
        v.phone,
        v.status,
        v.occupation,
        v.tshirtSize,
        v.dietaryRestrictions,
        v.preferredTasks?.join('; '),
        v.assignedTasks?.join('; '),
        v.availability,
        ticket ? TICKET_LABELS[ticket.state] : '',
        v.confirmedAt,
      ]
    }),
  )
}

export function volunteersCsvFilename(conferenceTitle: string): string {
  return csvFilename('volunteers', conferenceTitle)
}

/**
 * T-shirt and dietary tallies for volunteers who are approved or confirmed:
 * the people who will actually show up and need a shirt and food.
 */
export function volunteerLogistics(
  volunteers: Pick<
    Exportable,
    'name' | 'status' | 'tshirtSize' | 'dietaryRestrictions'
  >[],
) {
  const active = volunteers.filter(
    (v) =>
      v.status === VolunteerStatus.APPROVED ||
      v.status === VolunteerStatus.CONFIRMED,
  )
  const sizes = new Map<string, number>(
    Object.values(TShirtSize).map((s) => [s, 0]),
  )
  let noSize = 0
  const dietary: { name: string; restriction: string }[] = []
  for (const v of active) {
    if (v.tshirtSize)
      sizes.set(v.tshirtSize, (sizes.get(v.tshirtSize) ?? 0) + 1)
    else noSize++
    const restriction = v.dietaryRestrictions?.trim()
    if (restriction) dietary.push({ name: v.name, restriction })
  }
  return { count: active.length, sizes: [...sizes], noSize, dietary }
}
