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
import type { SponsorSubView } from './form/deal-status'
import clsx from 'clsx'

export interface SponsorPipelineFormData {
  sponsorId: string
  name: string
  website: string
  logo: string | null
  logoBright: string | null
  orgNumber: string
  address: string
  tierId: string
  addonIds: string[]
  contractStatus: ContractStatus
  status: SponsorStatus
  invoiceStatus: InvoiceStatus
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
}

/** A titled block with an uppercase eyebrow, separated by hairline dividers. */
function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * The sponsor detail form as a single scrollable column of labeled sections:
 * Identity → Deal status → Commercial terms → Ownership & tags → Manage →
 * Recent activity. Replaces the former 3/2 split that mixed unlike things
 * (identity + tier on the left; value + tags + activity on the right) and hid
 * the status controls in the modal header.
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
}: SponsorPipelineViewProps) {
  const isContractProcessStarted =
    sponsor?.contractStatus === 'registration-sent' ||
    sponsor?.contractStatus === 'contract-sent' ||
    sponsor?.contractStatus === 'contract-signed'

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

        {/* Deal status — the three coordinated tracks, labeled + gated */}
        <Section title="Deal status">
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
          />
        </Section>

        {/* Commercial terms — tier & add-ons drive the value that sits with them */}
        <Section title="Commercial terms">
          <div className="space-y-4">
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
              disabled={isContractProcessStarted}
              helperText={
                isContractProcessStarted
                  ? 'Locked — contract has been sent'
                  : undefined
              }
            />
          </div>
        </Section>

        {/* Ownership & tags */}
        <Section title="Ownership & tags">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </Section>

        {/* Manage — entry points to the focused sub-views */}
        {sponsor && (
          <Section title="Manage">
            <ManageCards
              sponsor={sponsor}
              hasLogo={Boolean(formData.logo)}
              onOpen={onOpenView}
            />
          </Section>
        )}

        {/* Recent activity */}
        {sponsor && (
          <Section title="Recent activity">
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
