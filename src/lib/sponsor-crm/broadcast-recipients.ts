import { z } from 'zod'
import type { SponsorForConferenceExpanded, SponsorStatus } from './types'

/**
 * Who an "Email sponsors" broadcast goes to (#1704 C1). The client sends only
 * these filters; the server resolves the recipients from the current
 * conference's own sponsors, so a client can never name an address.
 */
export const SPONSOR_STATUSES = [
  'prospect',
  'contacted',
  'negotiating',
  'closed-won',
  'closed-lost',
] as const satisfies readonly SponsorStatus[]

export const BROADCAST_CONTACT_ROLES = ['primary', 'billing', 'all'] as const
export type BroadcastContactRole = (typeof BROADCAST_CONTACT_ROLES)[number]

export const BROADCAST_CONTACT_ROLE_LABELS: Record<
  BroadcastContactRole,
  string
> = {
  primary: 'Primary contact only',
  billing: 'Billing contacts',
  all: 'All contacts',
}

export const BroadcastFiltersSchema = z
  .object({
    /** Tier ids; empty means every tier (and sponsors without one). */
    tierIds: z.array(z.string().min(1)).max(100).default([]),
    statuses: z.array(z.enum(SPONSOR_STATUSES)).min(1).default(['closed-won']),
    contactRole: z.enum(BROADCAST_CONTACT_ROLES).default('all'),
  })
  .strict()

export type BroadcastFilters = z.infer<typeof BroadcastFiltersSchema>

export const DEFAULT_BROADCAST_FILTERS: BroadcastFilters = {
  tierIds: [],
  statuses: ['closed-won'],
  contactRole: 'all',
}

export interface BroadcastRecipient {
  email: string
  name: string
  sponsorName: string
}

export interface ResolvedBroadcastRecipients {
  recipients: BroadcastRecipient[]
  /** The sponsors that contribute at least one recipient. */
  sponsors: SponsorForConferenceExpanded[]
}

/** The billing role as the contact editor offers it (`CONTACT_ROLE_OPTIONS`). */
const isBilling = (role?: string) => /billing/i.test(role ?? '')

/**
 * Pure: the caller passes sponsors ALREADY scoped to one conference. Contacts
 * without an address are skipped and addresses are deduplicated
 * case-insensitively, as the audience sync does. Erased contacts are gone from
 * `contactPersons`, so they cannot appear; opt-outs are enforced by the
 * audience at send time.
 */
export function resolveBroadcastRecipients(
  sponsors: SponsorForConferenceExpanded[],
  filters: BroadcastFilters,
): ResolvedBroadcastRecipients {
  const seen = new Set<string>()
  const recipients: BroadcastRecipient[] = []
  const contributing: SponsorForConferenceExpanded[] = []

  for (const sfc of sponsors) {
    if (!filters.statuses.includes(sfc.status)) continue
    if (
      filters.tierIds.length > 0 &&
      !(sfc.tier && filters.tierIds.includes(sfc.tier._id))
    )
      continue

    let added = false
    for (const c of sfc.contactPersons ?? []) {
      const email = c.email?.trim()
      if (!email) continue
      if (filters.contactRole === 'primary' && !c.isPrimary) continue
      if (filters.contactRole === 'billing' && !isBilling(c.role)) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      recipients.push({
        email,
        name: c.name?.trim() ?? '',
        sponsorName: sfc.sponsor.name,
      })
      added = true
    }
    if (added) contributing.push(sfc)
  }

  return { recipients, sponsors: contributing }
}
