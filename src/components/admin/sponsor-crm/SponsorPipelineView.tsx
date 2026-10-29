'use client'

import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  InvoiceStatus,
  ContractStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { SponsorActivityTimeline } from '../sponsor/SponsorActivityTimeline'
import type { SponsorTier } from '@/lib/sponsor/types'
import {
  SponsorCombobox,
  TierRadioGroup,
  AddonsCheckboxGroup,
  OrganizerCombobox,
  ContractValueInput,
  TagCombobox,
  SponsorGlobalInfoFields,
  DealStatusSection,
} from './form'
import { ManageCards } from './ManageCards'
import { SponsorTicketsBlock, nameMatchedCodes } from './SponsorTicketsBlock'
import { api } from '@/lib/trpc/client'
import type { SponsorSubView } from './form/deal-status'
import { hasPositiveContractValue } from '@/lib/sponsor-crm/contract-readiness'
import clsx from 'clsx'
import Link from 'next/link'
import { EnvelopeIcon, TicketIcon } from '@heroicons/react/24/outline'

export interface SponsorPipelineFormData {
  sponsorId: string
  name: string
  website: string
  logo: string | null
  logoBright: string | null
  orgNumber: string
  address: string
  blueskyHandle: string
  linkedinUrl: string
  tierId: string
  addonIds: string[]
  contractStatus: ContractStatus
  status: SponsorStatus
  invoiceStatus: InvoiceStatus
  invoiceDueAt: string
  contractValue: string
  contractCurrency: 'NOK' | 'USD' | 'EUR' | 'GBP'
  tags: SponsorTag[]
  assignedTo: string
}

interface Organizer {
  _id: string
  name: string
  email: string
  avatar?: string | null | undefined
}

interface SimpleSponsor {
  _id: string
  name: string
  website?: string
  logo?: string | null
}

export interface SponsorPipelineViewProps {
  formData: SponsorPipelineFormData
  onFormDataChange: (
    updater: (prev: SponsorPipelineFormData) => SponsorPipelineFormData,
  ) => void
  onContractValueEdited?: () => void
  sponsor: SponsorForConferenceExpanded | null
  availableSponsors: SimpleSponsor[]
  regularTiers: SponsorTier[]
  addonTiers: SponsorTier[]
  organizers: Organizer[]
  isPending: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  /** Open one of the focused sub-views (contract / contacts / logo / history). */
  onOpenView: (view: SponsorSubView) => void
  /**
   * Send an email to this sponsor (the shared `SponsorSendModal`, opened OVER
   * this modal by the host). Omitted ⇒ the Manage grid shows no Send email
   * card.
   */
  onSendEmail?: () => void
  /** Send → Discount codes (#1262). Omitted when ticketing is off. */
  onSendDiscountCodes?: () => void
}

/** A titled block with an uppercase eyebrow, separated by hairline dividers. */
function Section({
  title,
  action,
  children,
}: {
  title: string
  /** A link or button beside the heading. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="py-5 first:pt-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const SEND_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20 dark:focus-visible:outline-indigo-400'

const LINK =
  'rounded text-xs font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300'

/**
 * The sponsor detail form as one scrollable column of sections: Company →
 * Deal (stage, tier, add-ons, value) → Owner & tags → Sponsor details
 * (contract, contacts, logo) → Talk to the sponsor (sends, messages,
 * communications) → Activity (recent list, composer, history).
 */
export function SponsorPipelineView({
  formData,
  onFormDataChange,
  onContractValueEdited,
  sponsor,
  availableSponsors,
  regularTiers,
  addonTiers,
  organizers,
  isPending,
  onSubmit,
  onCancel,
  onOpenView,
  onSendEmail,
  onSendDiscountCodes,
}: SponsorPipelineViewProps) {
  // The same codes the discount send resolves: stored, or matched by name.
  const codeOptions = api.sponsor.crm.discountCodeOptions.useQuery(
    { sponsorForConferenceId: sponsor?._id ?? '' },
    {
      enabled: !!sponsor && !!onSendDiscountCodes,
      refetchOnWindowFocus: false,
    },
  )
  const hasCodes =
    !!sponsor?.discountCodes?.length ||
    nameMatchedCodes(codeOptions.data?.codes).length > 0
  const isContractValueLocked =
    (sponsor?.contractStatus === 'contract-sent' ||
      sponsor?.contractStatus === 'contract-signed') &&
    hasPositiveContractValue(sponsor?.contractValue)

  return (
    <form onSubmit={onSubmit}>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* Identity — sponsor picker when creating, company details when editing */}
        <Section title={sponsor ? 'Company' : 'Sponsor'}>
          {!sponsor ? (
            <SponsorCombobox
              value={formData.sponsorId}
              onChange={(value) =>
                onFormDataChange((prev) => ({ ...prev, sponsorId: value }))
              }
              availableSponsors={availableSponsors}
              disabled={!!sponsor}
            />
          ) : (
            <SponsorGlobalInfoFields
              name={formData.name}
              website={formData.website}
              orgNumber={formData.orgNumber}
              address={formData.address}
              disabled={isPending}
              blueskyHandle={formData.blueskyHandle}
              linkedinUrl={formData.linkedinUrl}
              onBlueskyHandleChange={(blueskyHandle) =>
                onFormDataChange((prev) => ({ ...prev, blueskyHandle }))
              }
              onLinkedinUrlChange={(linkedinUrl) =>
                onFormDataChange((prev) => ({ ...prev, linkedinUrl }))
              }
              onNameChange={(name) =>
                onFormDataChange((prev) => ({ ...prev, name }))
              }
              onWebsiteChange={(website) =>
                onFormDataChange((prev) => ({ ...prev, website }))
              }
              onOrgNumberChange={(orgNumber) =>
                onFormDataChange((prev) => ({ ...prev, orgNumber }))
              }
              onAddressChange={(address) =>
                onFormDataChange((prev) => ({ ...prev, address }))
              }
            />
          )}
        </Section>

        {/* Deal — the three coordinated tracks, then the commercial terms */}
        <Section title="Deal">
          <div className="space-y-4">
            <DealStatusSection
              formData={formData}
              sponsor={sponsor}
              onStatusChange={(status) =>
                onFormDataChange((prev) => ({ ...prev, status }))
              }
              onContractStatusChange={(contractStatus) =>
                onFormDataChange((prev) => ({ ...prev, contractStatus }))
              }
              onInvoiceStatusChange={(invoiceStatus) =>
                onFormDataChange((prev) => ({ ...prev, invoiceStatus }))
              }
              onInvoiceDueAtChange={(invoiceDueAt) =>
                onFormDataChange((prev) => ({ ...prev, invoiceDueAt }))
              }
            />
            <TierRadioGroup
              tiers={regularTiers}
              value={formData.tierId}
              onChange={(value) =>
                onFormDataChange((prev) => ({ ...prev, tierId: value }))
              }
            />
            <AddonsCheckboxGroup
              addons={addonTiers}
              value={formData.addonIds}
              onChange={(value) =>
                onFormDataChange((prev) => ({ ...prev, addonIds: value }))
              }
            />
            <ContractValueInput
              value={formData.contractValue}
              currency={formData.contractCurrency}
              onValueChange={(value) => {
                onFormDataChange((prev) => ({ ...prev, contractValue: value }))
                onContractValueEdited?.()
              }}
              onCurrencyChange={(value) =>
                onFormDataChange((prev) => ({
                  ...prev,
                  contractCurrency: value as 'NOK' | 'USD' | 'EUR' | 'GBP',
                }))
              }
              disabled={isContractValueLocked}
              helperText={
                isContractValueLocked
                  ? 'Locked — contract has been sent'
                  : undefined
              }
            />
          </div>
        </Section>

        {/* Owner & tags */}
        <Section title="Owner & tags">
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <OrganizerCombobox
                value={formData.assignedTo}
                onChange={(value) =>
                  onFormDataChange((prev) => ({ ...prev, assignedTo: value }))
                }
                organizers={organizers}
              />
              <TagCombobox
                value={formData.tags}
                onChange={(tags) =>
                  onFormDataChange((prev) => ({ ...prev, tags }))
                }
              />
            </div>
          </div>
        </Section>

        {sponsor && (
          <Section title="Sponsor details">
            <ManageCards
              sponsor={sponsor}
              hasLogo={Boolean(formData.logo)}
              onOpen={onOpenView}
              views={['contract', 'contacts', 'logo']}
            />
          </Section>
        )}

        {/* Same gate as the send: ticketing on and discount codes allowed. */}
        {sponsor && onSendDiscountCodes && (
          <Section title="Tickets">
            <SponsorTicketsBlock sponsor={sponsor} />
          </Section>
        )}

        {sponsor && (
          <Section title="Talk to the sponsor">
            {(onSendEmail || onSendDiscountCodes) && (
              <div className="mb-3 flex flex-wrap gap-2">
                {onSendEmail && (
                  <button
                    type="button"
                    onClick={onSendEmail}
                    className={SEND_BUTTON}
                  >
                    <EnvelopeIcon aria-hidden className="size-4" />
                    Send email
                  </button>
                )}
                {onSendDiscountCodes && (
                  <button
                    type="button"
                    onClick={onSendDiscountCodes}
                    disabled={!hasCodes}
                    title={
                      hasCodes ? undefined : 'Link a code under Tickets first'
                    }
                    className={`${SEND_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <TicketIcon aria-hidden className="size-4" />
                    Send codes
                  </button>
                )}
                {onSendDiscountCodes && !hasCodes && (
                  <p className="self-center text-xs text-gray-500 dark:text-gray-400">
                    No codes linked yet
                  </p>
                )}
                {!sponsor.contactPersons?.length && (
                  <p className="self-center text-xs text-amber-700 dark:text-amber-400">
                    Add a contact first
                  </p>
                )}
              </div>
            )}
            <ManageCards
              sponsor={sponsor}
              hasLogo={Boolean(formData.logo)}
              onOpen={onOpenView}
              views={['messages', 'communications']}
            />
          </Section>
        )}

        {sponsor && (
          <Section
            title="Activity"
            action={
              <span className="flex gap-3">
                <button
                  type="button"
                  onClick={() => onOpenView('history')}
                  className={LINK}
                >
                  History
                </button>
                <Link
                  href={`/admin/sponsors/activity?sponsor=${encodeURIComponent(sponsor._id)}`}
                  className={LINK}
                >
                  See all
                </Link>
              </span>
            }
          >
            <SponsorActivityTimeline
              sponsorForConferenceId={sponsor._id}
              limit={2}
              compact={true}
              showHeaderFooter={false}
            />
          </Section>
        )}
      </div>

      <div className="mt-6 flex flex-row-reverse gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="submit"
          disabled={isPending}
          className={clsx(
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
            isPending
              ? 'bg-gray-400 dark:bg-gray-600'
              : // House primary-footer-button color (brand-cloud-blue).
                'bg-brand-cloud-blue hover:bg-primary-700 dark:bg-indigo-600 dark:hover:bg-indigo-500',
          )}
        >
          {isPending ? (
            'Saving...'
          ) : (
            <>
              Save
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs">
                ⌘S
              </kbd>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex cursor-pointer justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
