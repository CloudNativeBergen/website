'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  PencilSquareIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { StatusBadge } from '@/components/StatusBadge'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'
import {
  formatDateTimeSafe,
  instantToOsloLocalInput,
  osloLocalInputToIso,
} from '@/lib/time'

interface WorkshopRegistrationSettingsProps {
  /** The sponsor start time: when sign-up opens for people with early access. */
  workshopRegistrationSponsorStart?: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}

/**
 * Workshop registration window (sponsor start, open and close datetimes). This is the one settings
 * island that can't fold into the generic {@link EditConferenceCard} fieldset
 * table because it is patched through the dedicated `workshop.admin` router
 * rather than a `conference.*` mutation. So it keeps its own mutation but adopts
 * the house interaction: a read-only card with a pencil trigger opening a
 * {@link ModalShell} form, and `router.refresh()` (never a full-page reload)
 * after a successful save.
 */
export function WorkshopRegistrationSettings({
  workshopRegistrationSponsorStart,
  workshopRegistrationStart,
  workshopRegistrationEnd,
}: WorkshopRegistrationSettingsProps) {
  const router = useRouter()
  const { showNotification } = useNotification()

  /**
   * Stored ISO instant → the EUROPE/OSLO wall-clock string the input
   * expects. `toISOString().slice(0,16)` would show UTC and shift the time by
   * the admin's timezone offset on every open/save round-trip.
   */
  // Edit fields display and accept EUROPE/OSLO wall-clock — the same zone the
  // read-only rows format in (formatDateTimeSafe) — so an admin outside Oslo
  // never sees two different times for one stored instant.
  const toLocalInput = (value?: string) => instantToOsloLocalInput(value)

  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stored = () => ({
    sponsorStartDate: toLocalInput(workshopRegistrationSponsorStart),
    startDate: toLocalInput(workshopRegistrationStart),
    endDate: toLocalInput(workshopRegistrationEnd),
  })
  // WHAT THE FORM TAKES AS STORED. A save sends only the fields that differ
  // from it (the server leaves the others alone), so a form opened before a
  // colleague's save cannot erase a time it never showed.
  const [opened, setOpened] = useState(stored)
  const [sponsorStartDate, setSponsorStartDate] = useState(
    opened.sponsorStartDate,
  )
  const [startDate, setStartDate] = useState(opened.startDate)
  const [endDate, setEndDate] = useState(opened.endDate)

  // THE CARD WAS READ AGAIN (after a save, accepted or refused) and a stored
  // time is not what the form took it to be. A field the organizer has not
  // touched follows the stored time; one they have changed keeps what they
  // typed, and is still a change. This is what makes a refusal about a time
  // the form did not show recoverable: the time appears, and can be cleared.
  const current = stored()
  if (
    current.sponsorStartDate !== opened.sponsorStartDate ||
    current.startDate !== opened.startDate ||
    current.endDate !== opened.endDate
  ) {
    if (sponsorStartDate === opened.sponsorStartDate) {
      setSponsorStartDate(current.sponsorStartDate)
    }
    if (startDate === opened.startDate) setStartDate(current.startDate)
    if (endDate === opened.endDate) setEndDate(current.endDate)
    setOpened(current)
  }

  const updateRegistrationTimes =
    api.workshop.admin.updateRegistrationTimes.useMutation({
      onSuccess: () => {
        setIsOpen(false)
        setError(null)
        showNotification({
          type: 'success',
          title: 'Settings updated',
          message: 'Workshop Registration saved.',
        })
        router.refresh()
      },
      onError: (err) => {
        // A REFUSAL IS JUDGED ON WHAT IS STORED, which this card may not be
        // showing: read the card again, so the form above takes it in.
        router.refresh()
        // SAID ONCE, in the form, where it stays while the organizer acts
        // on it. A toast as well said it twice, and on a phone it covered
        // the fields and Save.
        setError(
          err.message ||
            'Failed to update the workshop registration window. Please try again.',
        )
      },
    })

  const openModal = () => {
    const now = stored()
    setOpened(now)
    setSponsorStartDate(now.sponsorStartDate)
    setStartDate(now.startDate)
    setEndDate(now.endDate)
    setError(null)
    setIsOpen(true)
  }

  const closeModal = () => {
    setIsOpen(false)
    setError(null)
  }

  const handleSave = () => {
    setError(null)
    // The datetime-local value is entered as Europe/Oslo wall-clock (matching
    // the read-only rows); persist the unambiguous ISO instant. Malformed
    // values degrade to unset rather than throwing.
    const toIso = (v: string) => osloLocalInputToIso(v)
    const changes = {
      ...(sponsorStartDate !== opened.sponsorStartDate && {
        sponsorStartDate: toIso(sponsorStartDate),
      }),
      ...(startDate !== opened.startDate && { startDate: toIso(startDate) }),
      ...(endDate !== opened.endDate && { endDate: toIso(endDate) }),
    }
    if (Object.keys(changes).length === 0) {
      // Nothing to send, but the card may be out of date: read it again, so
      // what the organizer leaves behind is what is stored.
      router.refresh()
      closeModal()
      return
    }
    updateRegistrationTimes.mutate(changes)
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not set'
    // House formatter: consistent Europe/Oslo rendering regardless of the
    // admin's locale/timezone.
    return formatDateTimeSafe(dateString)
  }

  const getRegistrationStatus = (): {
    label: string
    color: 'gray' | 'yellow' | 'red' | 'green' | 'blue'
    note?: string
  } => {
    if (!workshopRegistrationStart && !workshopRegistrationEnd) {
      return { label: 'Not configured', color: 'gray' }
    }

    // THE ONE WINDOW RULE (#1345), asked as a person WITH early access: that
    // is the answer that tells the early-access window apart, so an organizer
    // is not told "Not yet open" while sponsors' people are signing up.
    const registration = workshopRegistrationWindow(
      {
        workshopRegistrationSponsorStart,
        workshopRegistrationStart,
        workshopRegistrationEnd,
      },
      { now: new Date(), earlyAccess: true },
    )
    const earlyAccessOpen = registration.status === 'open' && registration.early

    if (workshopRegistrationStart && workshopRegistrationEnd) {
      if (registration.status === 'not-open-yet') {
        return { label: 'Not yet open', color: 'yellow' }
      }
      if (registration.status === 'closed') {
        return { label: 'Closed', color: 'red' }
      }
      return earlyAccessOpen
        ? { label: 'Open for early access', color: 'blue' }
        : { label: 'Currently open', color: 'green' }
    }

    // Partial window. Enforcement (the workshop signup mutation and the public
    // workshop list) checks each bound independently — a missing bound is
    // simply not enforced — so a half-set window still gates signups and must
    // not read as "Not configured".
    if (workshopRegistrationStart) {
      const opens = formatDateTimeSafe(workshopRegistrationStart)
      return {
        label: 'Partially configured',
        color: 'yellow',
        note:
          registration.status === 'not-open-yet'
            ? `Signups open ${opens}. No close date is set, so once open they never close.`
            : earlyAccessOpen
              ? `Early access is open. Registration opens for everyone ${opens}. No close date is set, so once open it never closes.`
              : 'Signups are open. No close date is set, so they never close.',
      }
    }
    return {
      label: 'Partially configured',
      color: 'yellow',
      note:
        registration.status === 'closed'
          ? `Signups closed ${formatDateTimeSafe(workshopRegistrationEnd!)}. No open date is set, so they were open until then.`
          : `Signups are open now (no open date is set) and close ${formatDateTimeSafe(workshopRegistrationEnd!)}.`,
    }
  }

  const status = getRegistrationStatus()

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center">
          <CalendarIcon className="mr-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Workshop Registration
          </h3>
        </div>
        <button
          type="button"
          onClick={openModal}
          aria-label="Edit Workshop Registration"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <PencilSquareIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between gap-4 border-b border-gray-200 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Sponsor Early Access Opens
          </span>
          <span className="text-right text-sm text-gray-900 dark:text-white">
            {formatDateTime(workshopRegistrationSponsorStart)}
          </span>
        </div>

        <div className="flex justify-between gap-4 border-b border-gray-200 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Registration Opens
          </span>
          <span className="text-right text-sm text-gray-900 dark:text-white">
            {formatDateTime(workshopRegistrationStart)}
          </span>
        </div>

        <div className="flex justify-between gap-4 border-b border-gray-200 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Registration Closes
          </span>
          <span className="text-right text-sm text-gray-900 dark:text-white">
            {formatDateTime(workshopRegistrationEnd)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Status
          </span>
          <StatusBadge label={status.label} color={status.color} />
        </div>

        {status.note ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {status.note}
          </p>
        ) : null}
      </div>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Workshop Registration"
        subtitle="When workshop sign-ups open and close"
        icon={<PencilSquareIcon className="h-5 w-5" />}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="workshop-reg-sponsor-start"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Sponsor Early Access Opens (Europe/Oslo)
            </label>
            <input
              id="workshop-reg-sponsor-start"
              type="datetime-local"
              value={sponsorStartDate}
              onChange={(e) => setSponsorStartDate(e.target.value)}
              aria-describedby="workshop-reg-sponsor-start-help"
              className="block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p
              id="workshop-reg-sponsor-start-help"
              className="mt-1 text-sm text-gray-500 dark:text-gray-400"
            >
              Optional. When people with a sponsor&apos;s early-access link can
              sign up. Must be earlier than Registration Opens.
            </p>
          </div>

          <div>
            <label
              htmlFor="workshop-reg-start"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Registration Opens (Europe/Oslo)
            </label>
            <input
              id="workshop-reg-start"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="workshop-reg-end"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Registration Closes (Europe/Oslo)
            </label>
            <input
              id="workshop-reg-end"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={updateRegistrationTimes.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={updateRegistrationTimes.isPending}
              className="min-h-[44px]"
            >
              <CheckCircleIcon className="h-4 w-4" />
              {updateRegistrationTimes.isPending ? 'Saving…' : 'Save'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </div>
  )
}
