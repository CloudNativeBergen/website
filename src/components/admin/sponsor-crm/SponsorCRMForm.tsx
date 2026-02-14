'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
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
  PhotoIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { SponsorContactEditor } from '../sponsor/SponsorContactEditor'
import { SponsorLogoEditor } from '../sponsor/SponsorLogoEditor'
import { SponsorActivityTimeline } from '../sponsor/SponsorActivityTimeline'
import { SponsorContractView } from './SponsorContractView'
import { SponsorPipelineView } from './SponsorPipelineView'
import { SponsorTier } from '@/lib/sponsor/types'
import { useSponsorCRMFormMutations } from '@/hooks/useSponsorCRMFormMutations'

type FormView = 'pipeline' | 'contacts' | 'logo' | 'history' | 'contract'

interface SponsorCRMFormProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingSponsorsInCRM?: string[]
  initialView?: FormView
}

export function SponsorCRMForm({
  conferenceId,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
  existingSponsorsInCRM = [],
  initialView = 'pipeline',
}: SponsorCRMFormProps) {
  const [view, setView] = useState<FormView>(initialView)
  const [userHasEditedValue, setUserHasEditedValue] = useState(false)

  const [formData, setFormData] = useState({
    sponsorId: sponsor?.sponsor._id || '',
    name: sponsor?.sponsor.name || '',
    website: sponsor?.sponsor.website || '',
    logo: (sponsor?.sponsor.logo || null) as string | null,
    logoBright: (sponsor?.sponsor.logoBright || null) as string | null,
    orgNumber: sponsor?.sponsor.orgNumber || '',
    address: sponsor?.sponsor.address || '',
    tierId: sponsor?.tier?._id || '',
    addonIds: sponsor?.addons?.map((a) => a._id) || ([] as string[]),
    contractStatus: (sponsor?.contractStatus || 'none') as ContractStatus,
    status: (sponsor?.status || 'prospect') as SponsorStatus,
    invoiceStatus: (sponsor?.invoiceStatus || 'not-sent') as InvoiceStatus,
    contractValue: sponsor?.contractValue?.toString() || '',
    contractCurrency: (sponsor?.contractCurrency || 'NOK') as
      | 'NOK'
      | 'USD'
      | 'EUR'
      | 'GBP',
    notes: sponsor?.notes || '',
    tags: sponsor?.tags || ([] as SponsorTag[]),
    assignedTo: sponsor?.assignedTo?._id || '',
  })

  const { data: allSponsors = [] } = api.sponsor.list.useQuery()

  const availableSponsors = sponsor
    ? allSponsors
    : allSponsors.filter((s) => !existingSponsorsInCRM.includes(s._id))

  const { data: sponsorTiers = [] } =
    api.sponsor.tiers.listByConference.useQuery(
      { conferenceId },
      { enabled: isOpen },
    )

  const sortedSponsorTiers = useMemo(
    () => sortSponsorTiers(sponsorTiers),
    [sponsorTiers],
  )

  const regularTiers = useMemo(
    () =>
      sortedSponsorTiers.filter(
        (tier: SponsorTier) => tier.tierType !== 'addon',
      ),
    [sortedSponsorTiers],
  )
  const addonTiers = useMemo(
    () =>
      sortedSponsorTiers.filter(
        (tier: SponsorTier) => tier.tierType === 'addon',
      ),
    [sortedSponsorTiers],
  )

  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery(
    { conferenceId },
    { enabled: isOpen },
  )

  const handleClose = () => {
    setView('pipeline')
    onClose()
  }

  const { handleSubmit: submitForm, isPending } = useSponsorCRMFormMutations({
    conferenceId,
    sponsor,
    isOpen,
    onSuccess,
    onClose: handleClose,
  })

  const utils = api.useUtils()

  // Auto-fill contract value when package changes
  useEffect(() => {
    if (!isOpen || !sponsorTiers.length) return

    const selectedTier = regularTiers.find((t) => t._id === formData.tierId)
    const selectedAddons = addonTiers.filter((t) =>
      formData.addonIds.includes(t._id),
    )

    let total = 0

    // Helper to get price for currency
    const getPrice = (tier: SponsorTier) => {
      return (
        tier.price?.find((p) => p.currency === formData.contractCurrency)
          ?.amount || 0
      )
    }

    if (selectedTier) {
      total += getPrice(selectedTier)
    }

    selectedAddons.forEach((addon) => {
      total += getPrice(addon)
    })

    if (total > 0 && !userHasEditedValue) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData((prev) => ({
        ...prev,
        contractValue: total.toString(),
      }))
    }
  }, [
    formData.tierId,
    formData.addonIds,
    formData.contractCurrency,
    regularTiers,
    addonTiers,
    isOpen,
    sponsorTiers.length,
    userHasEditedValue,
  ])

  // CMD+S / CTRL+S keyboard shortcut to save the form
  useEffect(() => {
    const isEditingContacts = view === 'contacts'
    const isEditingLogo = view === 'logo'
    const isViewingHistory = view === 'history'
    if (!isOpen || isEditingContacts || isEditingLogo || isViewingHistory)
      return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const form = document.querySelector('form')
        if (form && !isPending) {
          form.requestSubmit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, view, isPending])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm(formData)
  }

  const missingData = useMemo(() => {
    if (!sponsor) return null
    const hasContacts =
      sponsor.contactPersons && sponsor.contactPersons.length > 0
    const hasLogo = !!formData.logo && formData.logo.length > 0
    return {
      contacts: !hasContacts,
      logo: !hasLogo,
    }
  }, [sponsor, formData.logo])

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
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-start sm:p-0 sm:pt-16">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <DialogPanel className="relative flex max-h-[85vh] w-full max-w-3xl transform flex-col overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                  <div className="shrink-0 border-b border-gray-200 p-6 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          {view !== 'pipeline' && (
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
                              : view === 'logo'
                                ? 'Sponsor Logo'
                                : view === 'history'
                                  ? 'Activity History'
                                  : view === 'contract'
                                    ? 'Contract'
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
                          <>
                            <button
                              type="button"
                              onClick={() => setView('contract')}
                              className={clsx(
                                'relative inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold shadow-sm ring-1 transition-colors ring-inset',
                                view === 'contract'
                                  ? 'bg-indigo-50 text-indigo-600 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500/50'
                                  : 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700',
                              )}
                              title="Contract"
                            >
                              {sponsor.contractStatus === 'contract-signed' && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900" />
                              )}
                              {(sponsor.contractStatus === 'contract-sent' ||
                                sponsor.signatureStatus === 'pending') && (
                                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
                                )}
                              <DocumentTextIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">Contract</span>
                            </button>
                            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
                            <button
                              type="button"
                              onClick={() => setView('history')}
                              className={clsx(
                                'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold shadow-sm ring-1 transition-colors ring-inset',
                                view === 'history'
                                  ? 'bg-indigo-50 text-indigo-600 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500/50'
                                  : 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700',
                              )}
                              title="View history"
                            >
                              <ClockIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">History</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setView('logo')}
                              className={clsx(
                                'relative inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold shadow-sm ring-1 transition-colors ring-inset',
                                view === 'logo'
                                  ? 'bg-indigo-50 text-indigo-600 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500/50'
                                  : missingData?.logo
                                    ? 'bg-white text-amber-600 ring-amber-300 hover:bg-amber-50 dark:bg-gray-800 dark:text-amber-400 dark:ring-amber-500/50 dark:hover:bg-gray-700'
                                    : 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700',
                              )}
                              title={
                                missingData?.logo
                                  ? 'No logo uploaded \u2014 click to add'
                                  : 'Manage logo'
                              }
                            >
                              {missingData?.logo && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" />
                              )}
                              <PhotoIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">Logo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setView('contacts')}
                              className={clsx(
                                'relative inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold shadow-sm ring-1 transition-colors ring-inset',
                                view === 'contacts'
                                  ? 'bg-indigo-50 text-indigo-600 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500/50'
                                  : missingData?.contacts
                                    ? 'bg-white text-amber-600 ring-amber-300 hover:bg-amber-50 dark:bg-gray-800 dark:text-amber-400 dark:ring-amber-500/50 dark:hover:bg-gray-700'
                                    : 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700',
                              )}
                              title={
                                missingData?.contacts
                                  ? 'No contacts \u2014 click to add'
                                  : 'Manage contact persons'
                              }
                            >
                              {missingData?.contacts && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" />
                              )}
                              <UserGroupIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">Contacts</span>
                            </button>
                          </>
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
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="min-h-100 text-left">
                      {view === 'contacts' && sponsor ? (
                        <SponsorContactEditor
                          sponsorForConference={sponsor}
                          onSuccess={() => {
                            utils.sponsor.crm.list.invalidate()
                            setView('pipeline')
                          }}
                          onCancel={() => setView('pipeline')}
                        />
                      ) : view === 'logo' ? (
                        <SponsorLogoEditor
                          logo={formData.logo}
                          logoBright={formData.logoBright}
                          name={formData.name}
                          onChange={(updates) =>
                            setFormData((prev) => ({
                              ...prev,
                              ...updates,
                            }))
                          }
                          className="py-4"
                        />
                      ) : view === 'history' && sponsor ? (
                        <div className="py-4">
                          <SponsorActivityTimeline
                            conferenceId={conferenceId}
                            sponsorForConferenceId={sponsor._id}
                            showHeaderFooter={false}
                            limit={20}
                          />
                        </div>
                      ) : view === 'contract' && sponsor ? (
                        <SponsorContractView
                          conferenceId={conferenceId}
                          sponsor={sponsor}
                          onSuccess={() => {
                            utils.sponsor.crm.list.invalidate()
                          }}
                        />
                      ) : (
                        <SponsorPipelineView
                          formData={formData}
                          onFormDataChange={setFormData}
                          onContractValueEdited={() =>
                            setUserHasEditedValue(true)
                          }
                          sponsor={sponsor}
                          availableSponsors={availableSponsors}
                          regularTiers={regularTiers}
                          addonTiers={addonTiers}
                          organizers={organizers}
                          isPending={isPending}
                          onSubmit={handleSubmit}
                          onCancel={handleClose}
                        />
                      )}
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
