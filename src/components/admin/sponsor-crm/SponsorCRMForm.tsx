'use client'

import { useState, useEffect, Fragment } from 'react'
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
import { sortSponsorTiers } from '@/components/admin/sponsor-crm/utils'
import {
  XMarkIcon,
  ChevronLeftIcon,
  UserGroupIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  StatusListbox,
  SponsorCombobox,
  TierRadioGroup,
  AddonsCheckboxGroup,
  OrganizerCombobox,
  ContractValueInput,
  TagCombobox,
} from './form'
import { STATUSES, INVOICE_STATUSES, CONTRACT_STATUSES } from './form/constants'
import { useNotification } from '@/components/admin/NotificationProvider'
import { SponsorContactEditor } from '../sponsor/SponsorContactEditor'
import { SponsorWithContactInfo, SponsorTier } from '@/lib/sponsor/types'
import { SponsorIndividualEmailModal } from '../SponsorIndividualEmailModal'
import { Conference } from '@/lib/conference/types'

interface SponsorCRMFormProps {
  conferenceId: string
  conference: Conference
  domain: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingSponsorsInCRM?: string[]
}

export function SponsorCRMForm({
  conferenceId,
  conference,
  domain,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
  existingSponsorsInCRM = [],
}: SponsorCRMFormProps) {
  const [view, setView] = useState<'pipeline' | 'contacts'>('pipeline')
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
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
    includeContactInfo: true,
  })

  // Get the full sponsor object if editing, including contacts
  const editingFullSponsor =
    sponsor && allSponsors.length > 0
      ? (allSponsors.find(
          (s) => s._id === sponsor.sponsor._id,
        ) as SponsorWithContactInfo)
      : null

  const availableSponsors = sponsor
    ? allSponsors
    : allSponsors.filter((s) => !existingSponsorsInCRM.includes(s._id))

  const { data: sponsorTiers = [] } =
    api.sponsor.tiers.listByConference.useQuery(
      { conferenceId },
      { enabled: isOpen },
    )

  const sortedSponsorTiers = sortSponsorTiers(sponsorTiers)

  const regularTiers = sortedSponsorTiers.filter(
    (tier: SponsorTier) => tier.tier_type !== 'addon',
  )
  const addonTiers = sortedSponsorTiers.filter(
    (tier: SponsorTier) => tier.tier_type === 'addon',
  )

  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery(
    { conferenceId },
    { enabled: isOpen },
  )

  const handleClose = () => {
    setView('pipeline')
    onClose()
  }

  const handleSuccess = () => {
    onSuccess()
    handleClose()
  }

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
      handleSuccess()
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
      handleSuccess()
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
      // Reset mutation states and view when modal opens
      resetCreateMutation()
      resetUpdateMutation()
      setView('pipeline')

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
    if (!isOpen || view === 'contacts') return

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
  }, [isOpen, view, createMutation.isPending, updateMutation.isPending])

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
    <>
      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
                <DialogPanel className="relative max-h-[90vh] w-full max-w-3xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-6 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-start justify-between">
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        {view === 'contacts' && (
                          <button
                            onClick={() => setView('pipeline')}
                            className="-ml-1.5 cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-800 dark:hover:text-indigo-400"
                            title="Back to Pipeline"
                          >
                            <ChevronLeftIcon className="h-6 w-6" />
                          </button>
                        )}
                        <DialogTitle className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                          {view === 'contacts'
                            ? 'Manage Contacts'
                            : sponsor
                              ? 'Edit Sponsor'
                              : 'Add Sponsor to Pipeline'}
                        </DialogTitle>
                      </div>
                      {sponsor && view === 'pipeline' && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {sponsor.sponsor.name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {sponsor && (
                        <button
                          type="button"
                          onClick={() => {
                            handleClose()
                            setIsEmailModalOpen(true)
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
                          title="Email sponsor contacts"
                        >
                          <EnvelopeIcon className="h-4 w-4" />
                          <span className="hidden sm:inline">Email</span>
                        </button>
                      )}
                      {sponsor && view === 'pipeline' && (
                        <button
                          type="button"
                          onClick={() => setView('contacts')}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
                          title="Manage contact persons"
                        >
                          <UserGroupIcon className="h-4 w-4" />
                          <span className="hidden sm:inline">Contacts</span>
                        </button>
                      )}
                      <button
                        onClick={handleClose}
                        className="cursor-pointer rounded-md text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:text-gray-500 dark:hover:text-gray-400"
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 text-left">
                    {view === 'contacts' && editingFullSponsor ? (
                      <SponsorContactEditor
                        sponsor={editingFullSponsor}
                        onSuccess={() => {
                          utils.sponsor.list.invalidate()
                          setView('pipeline') // Return to pipeline view on save
                        }}
                        onCancel={() => setView('pipeline')}
                      />
                    ) : (
                      <form onSubmit={handleSubmit}>
                        <div className="space-y-3">
                          {/* Sponsor Selection - Only show when adding new */}
                          {!sponsor && (
                            <SponsorCombobox
                              value={formData.sponsorId}
                              onChange={(value) =>
                                setFormData({ ...formData, sponsorId: value })
                              }
                              availableSponsors={availableSponsors}
                              disabled={!!sponsor}
                            />
                          )}

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
                                  setFormData({
                                    ...formData,
                                    contractStatus: value,
                                  })
                                }
                                options={CONTRACT_STATUSES}
                              />
                            </div>

                            <div>
                              <StatusListbox
                                label="Invoice Status *"
                                value={formData.invoiceStatus}
                                onChange={(value) =>
                                  setFormData({
                                    ...formData,
                                    invoiceStatus: value,
                                  })
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
                                setFormData({
                                  ...formData,
                                  contractValue: value,
                                })
                              }
                              onCurrencyChange={(value) =>
                                setFormData({
                                  ...formData,
                                  contractCurrency: value,
                                })
                              }
                            />
                          </div>

                          {/* Tags */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="col-span-full">
                              <TagCombobox
                                value={formData.tags}
                                onChange={(tags) =>
                                  setFormData({ ...formData, tags })
                                }
                              />
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
                                setFormData({
                                  ...formData,
                                  notes: e.target.value,
                                })
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
                              createMutation.isPending ||
                              updateMutation.isPending
                            }
                            className={clsx(
                              'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
                              createMutation.isPending ||
                                updateMutation.isPending
                                ? 'bg-gray-400 dark:bg-gray-600'
                                : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
                            )}
                          >
                            {createMutation.isPending ||
                            updateMutation.isPending ? (
                              'Saving...'
                            ) : (
                              <>
                                {sponsor ? 'Update' : 'Add'}
                                <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs">
                                  ⌘S
                                </kbd>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleClose}
                            className="inline-flex cursor-pointer justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Email Modal */}
      {sponsor && (
        <SponsorIndividualEmailModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          sponsorForConference={sponsor}
          domain={domain}
          fromEmail={conference?.sponsor_email || ''}
          conference={{
            title: conference?.title || '',
            city: conference?.city || '',
            country: conference?.country || '',
            start_date: conference?.start_date || '',
            domains: conference?.domains || [domain],
            social_links: conference?.social_links,
          }}
        />
      )}
    </>
  )
}
