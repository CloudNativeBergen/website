'use client'

import { useState, useEffect, Fragment } from 'react'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  InvoiceStatus,
  ContractStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { sortSponsorTiersByValue } from '@/lib/sponsor/utils'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  StatusListbox,
  SponsorCombobox,
  TierRadioGroup,
  AddonsCheckboxGroup,
  OrganizerCombobox,
  ContractValueInput,
} from './form'
import {
  STATUSES,
  INVOICE_STATUSES,
  CONTRACT_STATUSES,
  TAGS,
} from './form/constants'
import { useNotification } from '@/components/admin/NotificationProvider'

interface SponsorCRMFormProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingSponsorsInCRM?: string[]
}

export function SponsorCRMForm({
  conferenceId,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
  existingSponsorsInCRM = [],
}: SponsorCRMFormProps) {
  const { showNotification } = useNotification()

  const [formData, setFormData] = useState({
    sponsorId: '',
    tierId: '',
    addonIds: [] as string[],
    contractStatus: 'none' as ContractStatus,
    status: 'prospect' as SponsorStatus,
    invoiceStatus: 'not-sent' as InvoiceStatus,
    contractValue: '',
    contractCurrency: 'NOK',
    notes: '',
    tags: [] as SponsorTag[],
    assignedTo: '',
  })

  const { data: allSponsors = [] } = api.sponsor.list.useQuery({
    includeContactInfo: false,
  })

  const availableSponsors = sponsor
    ? allSponsors
    : allSponsors.filter((s) => !existingSponsorsInCRM.includes(s._id))

  const { data: sponsorTiers = [] } =
    api.sponsor.tiers.listByConference.useQuery(
      { conferenceId },
      { enabled: isOpen },
    )

  const sortedSponsorTiers = sortSponsorTiersByValue(sponsorTiers)

  const regularTiers = sortedSponsorTiers.filter(
    (tier) => tier.tier_type !== 'addon',
  )
  const addonTiers = sortedSponsorTiers.filter(
    (tier) => tier.tier_type === 'addon',
  )

  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery(
    undefined,
    { enabled: isOpen },
  )

  const createMutation = api.sponsor.crm.create.useMutation({
    onSuccess: async () => {
      // Invalidate all sponsor queries to ensure fresh data
      await utils.sponsor.crm.list.invalidate()
      await utils.sponsor.crm.list.refetch()
      showNotification({
        title: 'Success',
        message: 'Sponsor added to pipeline',
        type: 'success',
      })
      onSuccess()
      onClose()
    },
    onError: (error) => {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to add sponsor',
        type: 'error',
      })
    },
  })

  const updateMutation = api.sponsor.crm.update.useMutation({
    onSuccess: async () => {
      // Invalidate all sponsor queries to ensure fresh data
      await utils.sponsor.crm.list.invalidate()
      await utils.sponsor.crm.list.refetch()
      showNotification({
        title: 'Success',
        message: 'Sponsor updated successfully',
        type: 'success',
      })
      onSuccess()
      onClose()
    },
    onError: (error) => {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to update sponsor',
        type: 'error',
      })
    },
  })

  const utils = api.useUtils()

  const resetCreateMutation = createMutation.reset
  const resetUpdateMutation = updateMutation.reset

  useEffect(() => {
    if (isOpen) {
      // Reset mutation states when modal opens
      resetCreateMutation()
      resetUpdateMutation()

      if (sponsor) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize form from sponsor data
        setFormData({
          sponsorId: sponsor.sponsor._id,
          tierId: sponsor.tier?._id || '',
          addonIds: sponsor.addons?.map((a) => a._id) || [],
          contractStatus: sponsor.contract_status,
          status: sponsor.status,
          invoiceStatus: sponsor.invoice_status,
          contractValue: sponsor.contract_value?.toString() || '',
          contractCurrency: sponsor.contract_currency || 'NOK',
          notes: sponsor.notes || '',
          tags: sponsor.tags || [],
          assignedTo: sponsor.assigned_to?._id || '',
        })
      } else {
        setFormData({
          sponsorId: '',
          tierId: '',
          addonIds: [],
          contractStatus: 'none',
          status: 'prospect',
          invoiceStatus: 'not-sent',
          contractValue: '',
          contractCurrency: 'NOK',
          notes: '',
          tags: [],
          assignedTo: '',
        })
      }
    }
  }, [sponsor, isOpen, resetCreateMutation, resetUpdateMutation])

  // CMD+S / CTRL+S keyboard shortcut to save the form
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        // Create a synthetic form submit event
        const form = document.querySelector('form')
        if (form && !createMutation.isPending && !updateMutation.isPending) {
          form.requestSubmit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, createMutation.isPending, updateMutation.isPending])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (sponsor) {
      await updateMutation.mutateAsync({
        id: sponsor._id,
        tier: formData.tierId || undefined,
        addons: formData.addonIds,
        contract_status: formData.contractStatus,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency as
          | 'NOK'
          | 'USD'
          | 'EUR'
          | 'GBP',
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assigned_to: formData.assignedTo || null,
      })
    } else {
      await createMutation.mutateAsync({
        sponsor: formData.sponsorId,
        conference: conferenceId,
        tier: formData.tierId || undefined,
        addons: formData.addonIds.length > 0 ? formData.addonIds : undefined,
        contract_status: formData.contractStatus,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency as
          | 'NOK'
          | 'USD'
          | 'EUR'
          | 'GBP',
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assigned_to: formData.assignedTo || undefined,
      })
    }
  }

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/75 transition-opacity dark:bg-gray-900/75" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="max-h-[90vh] w-full max-w-3xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-4 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:text-gray-500 dark:hover:text-gray-400"
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <DialogTitle className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                  {sponsor ? 'Edit Sponsor' : 'Add Sponsor to Pipeline'}
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-3">
                  <div className="space-y-3">
                    {/* Sponsor Selection */}
                    <SponsorCombobox
                      value={formData.sponsorId}
                      onChange={(value) =>
                        setFormData({ ...formData, sponsorId: value })
                      }
                      availableSponsors={availableSponsors}
                      disabled={!!sponsor}
                    />

                    {/* Tier Selection */}
                    <TierRadioGroup
                      tiers={regularTiers}
                      value={formData.tierId}
                      onChange={(value) =>
                        setFormData({ ...formData, tierId: value })
                      }
                    />

                    {/* Addons Selection */}
                    <AddonsCheckboxGroup
                      addons={addonTiers}
                      value={formData.addonIds}
                      onChange={(value) =>
                        setFormData({ ...formData, addonIds: value })
                      }
                    />

                    {/* Status, Contract Status, and Invoice Status */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <StatusListbox
                          label="Status *"
                          value={formData.status}
                          onChange={(value) =>
                            setFormData({ ...formData, status: value })
                          }
                          options={STATUSES}
                        />
                      </div>

                      <div>
                        <StatusListbox
                          label="Contract Status *"
                          value={formData.contractStatus}
                          onChange={(value) =>
                            setFormData({ ...formData, contractStatus: value })
                          }
                          options={CONTRACT_STATUSES}
                        />
                      </div>

                      <div>
                        <StatusListbox
                          label="Invoice Status *"
                          value={formData.invoiceStatus}
                          onChange={(value) =>
                            setFormData({ ...formData, invoiceStatus: value })
                          }
                          options={INVOICE_STATUSES}
                          disabled={
                            !formData.contractValue ||
                            parseFloat(formData.contractValue) === 0
                          }
                          helperText={
                            !formData.contractValue ||
                            parseFloat(formData.contractValue) === 0
                              ? '(No cost)'
                              : undefined
                          }
                        />
                      </div>
                    </div>

                    {/* Assigned To and Contract Value */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <OrganizerCombobox
                        value={formData.assignedTo}
                        onChange={(value) =>
                          setFormData({ ...formData, assignedTo: value })
                        }
                        organizers={organizers}
                      />

                      <ContractValueInput
                        value={formData.contractValue}
                        currency={formData.contractCurrency}
                        onValueChange={(value) =>
                          setFormData({ ...formData, contractValue: value })
                        }
                        onCurrencyChange={(value) =>
                          setFormData({ ...formData, contractCurrency: value })
                        }
                      />
                    </div>

                    {/* Tags */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                          Tags
                        </label>
                        <div className="mt-1.5">
                          <FilterDropdown
                            label="Select tags"
                            activeCount={formData.tags.length}
                            keepOpen
                            fixedWidth
                            forceDropUp
                          >
                            {TAGS.map((tag) => (
                              <FilterOption
                                key={tag.value}
                                checked={formData.tags.includes(tag.value)}
                                onClick={() => {
                                  if (formData.tags.includes(tag.value)) {
                                    setFormData({
                                      ...formData,
                                      tags: formData.tags.filter(
                                        (t) => t !== tag.value,
                                      ),
                                    })
                                  } else {
                                    setFormData({
                                      ...formData,
                                      tags: [...formData.tags, tag.value],
                                    })
                                  }
                                }}
                                keepOpen
                              >
                                {tag.label}
                              </FilterOption>
                            ))}
                          </FilterDropdown>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
                        Notes
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={2}
                        className="mt-1.5 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-row-reverse gap-3">
                    <button
                      type="submit"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      className={clsx(
                        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
                        createMutation.isPending || updateMutation.isPending
                          ? 'bg-gray-400 dark:bg-gray-600'
                          : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
                      )}
                    >
                      {createMutation.isPending || updateMutation.isPending ? (
                        'Saving...'
                      ) : (
                        <>
                          {sponsor ? 'Update' : 'Add'}
                          <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs">
                            ⌘S
                          </kbd>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
