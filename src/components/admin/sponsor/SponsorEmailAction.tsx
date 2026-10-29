'use client'

import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { GeneralBroadcastModal } from '@/components/admin/GeneralBroadcastModal'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'
import { api } from '@/lib/trpc/client'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor } from '@/lib/branding/theme'
import { formatConferenceDateLong } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'
import { SPONSOR_STATUS_LABELS } from '@/lib/sponsor-crm/labels'
import {
  BROADCAST_CONTACT_ROLES,
  BROADCAST_CONTACT_ROLE_LABELS,
  DEFAULT_BROADCAST_FILTERS,
  SPONSOR_STATUSES,
  type BroadcastFilters,
} from '@/lib/sponsor-crm/broadcast-recipients'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

const chip =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 has-checked:border-indigo-500 has-checked:bg-indigo-50 dark:border-gray-600 dark:text-gray-300 dark:has-checked:bg-indigo-900/30'

/**
 * "Email sponsors" (#1704 C1): the one broadcast action on the sponsors
 * overview, contacts and tiers pages. The organizer picks filters; the server
 * resolves who they match, for the count, the preview and the send alike.
 */
export function SponsorEmailAction({ conference }: { conference: Conference }) {
  const [filters, setFilters] = useState<BroadcastFilters>(
    DEFAULT_BROADCAST_FILTERS,
  )
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const recipientsQuery = api.sponsor.crm.broadcastRecipients.useQuery(
    filters,
    { staleTime: 30000 },
  )
  const tiersQuery = api.sponsor.tiers.listByConference.useQuery(undefined, {
    enabled: isBroadcastModalOpen,
    staleTime: 60000,
  })

  // Mirrors the server's own from-address resolution (see
  // `lib/email/broadcast.ts`) so the modal cannot advertise an address the
  // send would never use.
  const fromAddress = conference.sponsorEmail || conference.contactEmail
  const organizerName = conference.organizer?.trim()
  const fromEmail = fromAddress
    ? organizerName
      ? `${organizerName} <${fromAddress}>`
      : fromAddress
    : 'No sponsor or contact email configured'

  const contactCount = recipientsQuery.data?.contactCount ?? 0
  const sponsorCount = recipientsQuery.data?.sponsorCount ?? 0
  const tiers = (tiersQuery.data ?? []).filter((t) => t.tierType !== 'addon')

  const recipientStep = (
    <div className="space-y-3 text-sm">
      <fieldset>
        <legend className="mb-1 font-medium text-gray-900 dark:text-white">
          Pipeline stage
        </legend>
        <div className="flex flex-wrap gap-2">
          {SPONSOR_STATUSES.map((status) => (
            <label key={status} className={chip}>
              <input
                type="checkbox"
                className="sr-only"
                checked={filters.statuses.includes(status)}
                onChange={() => {
                  const statuses = toggle(filters.statuses, status)
                  if (statuses.length > 0) setFilters({ ...filters, statuses })
                }}
              />
              {SPONSOR_STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </fieldset>

      {tiers.length > 0 && (
        <fieldset>
          <legend className="mb-1 font-medium text-gray-900 dark:text-white">
            Tier{' '}
            <span className="font-normal text-gray-500">
              (none selected: every tier)
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {tiers.map((tier) => (
              <label key={tier._id} className={chip}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.tierIds.includes(tier._id)}
                  onChange={() =>
                    setFilters({
                      ...filters,
                      tierIds: toggle(filters.tierIds, tier._id),
                    })
                  }
                />
                {tier.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-1 font-medium text-gray-900 dark:text-white">
          Contacts
        </legend>
        <div className="flex flex-wrap gap-2">
          {BROADCAST_CONTACT_ROLES.map((role) => (
            <label key={role} className={chip}>
              <input
                type="radio"
                name="sponsor-email-contact-role"
                className="sr-only"
                checked={filters.contactRole === role}
                onChange={() => setFilters({ ...filters, contactRole: role })}
              />
              {BROADCAST_CONTACT_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      <p
        className="font-medium text-gray-900 dark:text-white"
        aria-live="polite"
      >
        {recipientsQuery.isLoading
          ? 'Counting recipients...'
          : `${plural(contactCount, 'contact')} at ${plural(sponsorCount, 'sponsor')}`}
      </p>

      {contactCount > 0 && (
        <details>
          <summary className="cursor-pointer text-gray-600 dark:text-gray-400">
            Preview recipients
          </summary>
          <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-gray-400">
            {recipientsQuery.data?.recipients.map((r) => (
              <li key={r.email}>
                {r.name || r.email} &lt;{r.email}&gt;, {r.sponsorName}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Contacts who have unsubscribed are skipped when the email is sent.
      </p>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setIsBroadcastModalOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <EnvelopeIcon className="size-4" aria-hidden="true" />
        <span>Email sponsors</span>
      </button>

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={(subject, message) =>
          handleBroadcastEmail(subject, message, filters)
        }
        onSyncContacts={handleSyncContacts}
        title="Email sponsors"
        recipientInfo={recipientStep}
        recipientCount={contactCount}
        recipientType="sponsor contacts"
        fromEmail={fromEmail}
        eventName={conference.title}
        eventLocation={[conference.city, conference.country]
          .filter(Boolean)
          .join(', ')}
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={conferenceBaseUrl(conference)}
        socialLinks={conference.socialLinks || []}
        brandColor={emailBrandColor(conference.theme)}
      />
    </>
  )
}
