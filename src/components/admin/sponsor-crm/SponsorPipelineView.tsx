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
} from './form'
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
}

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
}: SponsorPipelineViewProps) {
  const isContractProcessStarted =
    sponsor?.contractStatus === 'registration-sent' ||
    sponsor?.contractStatus === 'contract-sent' ||
    sponsor?.contractStatus === 'contract-signed'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <div className="col-span-1 space-y-4 md:col-span-3">
          {/* Sponsor Selection - Only show when adding new */}
          {!sponsor && (
            <SponsorCombobox
              value={formData.sponsorId}
              onChange={(value) =>
                onFormDataChange((prev) => ({
                  ...prev,
                  sponsorId: value,
                }))
              }
              availableSponsors={availableSponsors}
              disabled={!!sponsor}
            />
          )}

          {sponsor && (
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
                onFormDataChange((prev) => ({
                  ...prev,
                  orgNumber,
                }))
              }
              onAddressChange={(address) =>
                onFormDataChange((prev) => ({
                  ...prev,
                  address,
                }))
              }
            />
          )}

          {/* Tier Selection */}
          <TierRadioGroup
            tiers={regularTiers}
            value={formData.tierId}
            onChange={(value) =>
              onFormDataChange((prev) => ({
                ...prev,
                tierId: value,
              }))
            }
          />

          {/* Addons Selection */}
          <AddonsCheckboxGroup
            addons={addonTiers}
            value={formData.addonIds}
            onChange={(value) =>
              onFormDataChange((prev) => ({
                ...prev,
                addonIds: value,
              }))
            }
          />

          <OrganizerCombobox
            value={formData.assignedTo}
            onChange={(value) =>
              onFormDataChange((prev) => ({
                ...prev,
                assignedTo: value,
              }))
            }
            organizers={organizers}
          />
        </div>

        <div className="col-span-1 space-y-4 border-l border-gray-200 pl-6 md:col-span-2 dark:border-gray-700">
          <ContractValueInput
            value={formData.contractValue}
            currency={formData.contractCurrency}
            onValueChange={(value) => {
              onFormDataChange((prev) => ({
                ...prev,
                contractValue: value,
              }))
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

          <TagCombobox
            value={formData.tags}
            onChange={(tags) => onFormDataChange((prev) => ({ ...prev, tags }))}
          />

          {sponsor && (
            <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
              <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Recent Activity
              </h4>
              <SponsorActivityTimeline
                sponsorForConferenceId={sponsor._id}
                limit={2}
                compact={true}
                showHeaderFooter={false}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-row-reverse gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={clsx(
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
            isPending
              ? 'bg-gray-400 dark:bg-gray-600'
              : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
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
