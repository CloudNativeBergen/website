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
import { formatDateTimeSafe } from '@/lib/time'

interface WorkshopRegistrationSettingsProps {
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}

/**
 * Workshop registration window (open/close datetimes). This is the one settings
 * island that can't fold into the generic {@link EditConferenceCard} fieldset
 * table because it is patched through the dedicated `workshop.admin` router
 * rather than a `conference.*` mutation. So it keeps its own mutation but adopts
 * the house interaction: a read-only card with a pencil trigger opening a
 * {@link ModalShell} form, and `router.refresh()` (never a full-page reload)
 * after a successful save.
 */
export function WorkshopRegistrationSettings({
  workshopRegistrationStart,
  workshopRegistrationEnd,
}: WorkshopRegistrationSettingsProps) {
  const router = useRouter()
  const { showNotification } = useNotification()

  /**
   * Stored ISO (UTC) → the LOCAL wall-clock string a `datetime-local` input
   * expects. `toISOString().slice(0,16)` would show UTC and shift the time by
   * the admin's timezone offset on every open/save round-trip.
   */
  const toLocalInput = (value?: string) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(
    toLocalInput(workshopRegistrationStart),
  )
  const [endDate, setEndDate] = useState(toLocalInput(workshopRegistrationEnd))

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
        setError(err.message || 'Failed to update')
        showNotification({
          type: 'error',
          title: 'Could not save',
          message: err.message || 'Failed to update workshop registration.',
        })
      },
    })

  const openModal = () => {
    setStartDate(toLocalInput(workshopRegistrationStart))
    setEndDate(toLocalInput(workshopRegistrationEnd))
    setError(null)
    setIsOpen(true)
  }

  const closeModal = () => {
    setIsOpen(false)
    setError(null)
  }

  const handleSave = () => {
    setError(null)
    // The datetime-local value is a timezone-less LOCAL wall-clock string; the
    // Date constructor interprets it as local time, and we persist the
    // unambiguous ISO instant so storage is timezone-stable.
    const toIso = (v: string) => {
      if (!v) return null
      const d = new Date(v)
      // A malformed input value must degrade to unset, not throw a RangeError
      // out of toISOString and break the save flow.
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    updateRegistrationTimes.mutate({
      startDate: toIso(startDate),
      endDate: toIso(endDate),
    })
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not set'
    // House formatter: consistent Europe/Oslo rendering regardless of the
    // admin's locale/timezone.
    return formatDateTimeSafe(dateString)
  }

  const getRegistrationStatus = () => {
    if (!workshopRegistrationStart || !workshopRegistrationEnd) {
      return { label: 'Not configured', color: 'gray' as const }
    }
    const now = new Date()
    const start = new Date(workshopRegistrationStart)
    const end = new Date(workshopRegistrationEnd)
    if (now < start) return { label: 'Not yet open', color: 'yellow' as const }
    if (now > end) return { label: 'Closed', color: 'red' as const }
    return { label: 'Currently open', color: 'green' as const }
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
        <div className="flex justify-between border-b border-gray-200 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Registration Opens
          </span>
          <span className="text-sm text-gray-900 dark:text-white">
            {formatDateTime(workshopRegistrationStart)}
          </span>
        </div>

        <div className="flex justify-between border-b border-gray-200 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Registration Closes
          </span>
          <span className="text-sm text-gray-900 dark:text-white">
            {formatDateTime(workshopRegistrationEnd)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Status
          </span>
          <StatusBadge label={status.label} color={status.color} />
        </div>
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
              htmlFor="workshop-reg-start"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Registration Opens
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
              Registration Closes
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
