'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
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
import { getPrimaryAction } from './form/deal-status'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { SponsorContactEditor } from '../sponsor/SponsorContactEditor'
import { SponsorLogoEditor } from '../sponsor/SponsorLogoEditor'
import { SponsorActivityTimeline } from '../sponsor/SponsorActivityTimeline'
import { SponsorContractView } from './SponsorContractView'
import { SponsorPipelineView } from './SponsorPipelineView'
import { SponsorTier } from '@/lib/sponsor/types'
import { useSponsorCRMFormMutations } from '@/hooks/useSponsorCRMFormMutations'
import { SponsorMessagesPanel } from './SponsorMessagesPanel'

type FormView =
  | 'pipeline'
  | 'contacts'
  | 'logo'
  | 'history'
  | 'contract'
  // The sponsor↔organizer message thread (messaging G2b).
  | 'messages'

interface SponsorCRMFormProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (createdId?: string) => void
  existingSponsorsInCRM?: string[]
  initialView?: FormView
  onViewChange?: (view: FormView) => void
}

export function SponsorCRMForm({
  conferenceId,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
  existingSponsorsInCRM = [],
  initialView = 'pipeline',
  onViewChange,
}: SponsorCRMFormProps) {
  const [view, setViewState] = useState<FormView>(initialView)
  const setView = useCallback(
    (v: FormView) => {
      setViewState(v)
      onViewChange?.(v)
    },
    [onViewChange],
  )
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
      'NOK' | 'USD' | 'EUR' | 'GBP',
    tags: sponsor?.tags || ([] as SponsorTag[]),
    assignedTo: sponsor?.assignedTo?._id || '',
  })

  const { data: allSponsors = [] } = api.sponsor.list.useQuery()

  const availableSponsors = sponsor
    ? allSponsors
    : allSponsors.filter((s) => !existingSponsorsInCRM.includes(s._id))

  const { data: sponsorTiers = [] } =
    api.sponsor.tiers.listByConference.useQuery(undefined, { enabled: isOpen })

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
    undefined,
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

  // The single most-relevant next step for this sponsor, shown as a contextual
  // primary button in the header (only in the main pipeline view).
  const primaryAction = useMemo(
    () => (sponsor ? getPrimaryAction(formData, sponsor) : null),
    [sponsor, formData],
  )

  const handlePrimaryAction = () => {
    if (!primaryAction) return
    if (primaryAction.kind === 'view') {
      setView(primaryAction.target)
    } else if (primaryAction.kind === 'status') {
      setFormData((prev) => ({ ...prev, status: primaryAction.target }))
    } else {
      setFormData((prev) => ({ ...prev, invoiceStatus: primaryAction.target }))
    }
  }

  const primaryBlocked =
    primaryAction && primaryAction.kind !== 'view'
      ? primaryAction.blockedReason
      : undefined

  const SUBVIEW_TITLES: Record<Exclude<FormView, 'pipeline'>, string> = {
    contract: 'Contract',
    contacts: 'Contacts & billing',
    logo: 'Logo',
    history: 'History',
    messages: 'Messages',
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
                <DialogPanel className="relative flex max-h-[85dvh] w-full max-w-3xl transform flex-col overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                  <div className="shrink-0 border-b border-gray-200 p-6 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 text-left">
                        {view === 'pipeline' ? (
                          <DialogTitle className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                            {sponsor
                              ? 'Sponsor Details'
                              : 'Add Sponsor to Pipeline'}
                          </DialogTitle>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setView('pipeline')}
                              className="mb-1 -ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                            >
                              <ChevronLeftIcon className="h-4 w-4" />
                              Back to details
                            </button>
                            <DialogTitle className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                              {SUBVIEW_TITLES[view]}
                            </DialogTitle>
                          </>
                        )}
                        {sponsor && (
                          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                            {sponsor.sponsor.name}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {view === 'pipeline' && sponsor && primaryAction && (
                          // Tooltip lives on the wrapper span: a disabled
                          // <button> doesn't receive pointer events, so its own
                          // `title` wouldn't show the blocked reason on hover.
                          <span title={primaryBlocked}>
                            <button
                              type="button"
                              onClick={handlePrimaryAction}
                              disabled={Boolean(primaryBlocked)}
                              className={clsx(
                                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors',
                                primaryBlocked
                                  ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                                  : 'cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
                              )}
                            >
                              {primaryAction.label}
                              {primaryAction.kind === 'view' && (
                                <ArrowRightIcon className="h-4 w-4" />
                              )}
                            </button>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleClose}
                          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:text-gray-500 dark:hover:text-gray-400"
                        >
                          <span className="sr-only">Close</span>
                          <XMarkIcon className="h-6 w-6" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto overscroll-contain p-6">
                    <div className="min-h-100 text-left">
                      {view === 'contacts' && sponsor ? (
                        <SponsorContactEditor
                          sponsorForConference={sponsor}
                          onSuccess={() => {
                            utils.sponsor.crm.list.invalidate()
                            utils.sponsor.crm.healthViolations.invalidate()
                          }}
                          onCancel={handleClose}
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
                            utils.sponsor.crm.healthViolations.invalidate()
                          }}
                        />
                      ) : view === 'messages' && sponsor ? (
                        // Sponsor↔organizer thread (messaging G2b): ensured on
                        // open, then embedded for the organizer audience.
                        <SponsorMessagesPanel
                          sponsorForConferenceId={sponsor._id}
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
                          onOpenView={setView}
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
