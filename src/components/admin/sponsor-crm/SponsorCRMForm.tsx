'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ModalShell } from '@/components/ModalShell'
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
import { ChevronLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
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

  // Unsaved-changes flag driving ModalShell's dirty-close guard. Only USER
  // edits arm it (via updateFormData below) — programmatic writes like the
  // tier-price auto-fill effect keep using setFormData directly so merely
  // opening a sponsor never triggers the "Discard changes?" confirm.
  const [isDirty, setIsDirty] = useState(false)

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

  // User-initiated form updates: mark the form dirty and apply the change.
  const updateFormData: typeof setFormData = useCallback((value) => {
    setIsDirty(true)
    setFormData(value)
  }, [])

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
    try {
      await submitForm(formData)
      // Saved: the form is clean again, so closing needs no confirm.
      setIsDirty(false)
    } catch {
      // Errors already surface via the mutation onError notifications;
      // keep the dirty flag so unsaved edits stay guarded.
    }
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
      updateFormData((prev) => ({ ...prev, status: primaryAction.target }))
    } else {
      updateFormData((prev) => ({
        ...prev,
        invoiceStatus: primaryAction.target,
      }))
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

  // ModalShell hosts the canonical header (title + subtitle + guarded 44px
  // close). The back-button and the contextual primary action ("Mark as
  // Won" etc.) can't be slotted into ModalShell's header, so they live in a
  // compliant toolbar row at the top of the body instead — this keeps EVERY
  // close path (backdrop, Escape, header X) routed through the shell's
  // dirty-close guard.
  const showToolbar =
    view !== 'pipeline' ||
    Boolean(view === 'pipeline' && sponsor && primaryAction)

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      size="3xl"
      padded={false}
      title={
        view === 'pipeline'
          ? sponsor
            ? 'Sponsor Details'
            : 'Add Sponsor to Pipeline'
          : SUBVIEW_TITLES[view]
      }
      subtitle={sponsor ? sponsor.sponsor.name : undefined}
      confirmOnDirtyClose
      isDirty={isDirty}
      className="border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
    >
      {showToolbar && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-6 py-2.5 dark:border-gray-700">
          {view !== 'pipeline' ? (
            <button
              type="button"
              onClick={() => setView('pipeline')}
              className="-ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Back to details
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          {view === 'pipeline' && sponsor && primaryAction && (
            // Tooltip lives on the wrapper span: a disabled <button> doesn't
            // receive pointer events, so its own `title` wouldn't show the
            // blocked reason on hover.
            <span title={primaryBlocked}>
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={Boolean(primaryBlocked)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors',
                  primaryBlocked
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                    : 'cursor-pointer bg-brand-cloud-blue text-white hover:bg-primary-700 dark:bg-indigo-600 dark:hover:bg-indigo-500',
                )}
              >
                {primaryAction.label}
                {primaryAction.kind === 'view' && (
                  <ArrowRightIcon className="h-4 w-4" />
                )}
              </button>
            </span>
          )}
        </div>
      )}

      <div className="p-6">
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
                updateFormData((prev) => ({
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
            <SponsorMessagesPanel sponsorForConferenceId={sponsor._id} />
          ) : (
            <SponsorPipelineView
              formData={formData}
              onFormDataChange={updateFormData}
              onContractValueEdited={() => setUserHasEditedValue(true)}
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
    </ModalShell>
  )
}
