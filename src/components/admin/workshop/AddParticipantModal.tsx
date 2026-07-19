'use client'

import { useState, useEffect } from 'react'
import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { Dropdown } from '@/components/Form'
import { AdminButton } from '@/components/admin/AdminButton'
import type { ExperienceLevel, OperatingSystem } from '@/lib/workshop/types'

interface AddParticipantModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  onSubmit: (participant: ParticipantFormData) => void
  isSubmitting?: boolean
}

export interface ParticipantFormData {
  userName: string
  userEmail: string
  userWorkOSId: string
  experienceLevel: ExperienceLevel
  operatingSystem: OperatingSystem
}

const DEFAULT_PARTICIPANT: ParticipantFormData = {
  userName: '',
  userEmail: '',
  userWorkOSId: '',
  experienceLevel: 'intermediate' as ExperienceLevel,
  operatingSystem: 'macos' as OperatingSystem,
}

export function AddParticipantModal({
  isOpen,
  onClose,
  workshopTitle,
  onSubmit,
  isSubmitting = false,
}: AddParticipantModalProps) {
  const [formData, setFormData] =
    useState<ParticipantFormData>(DEFAULT_PARTICIPANT)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Reset the form each time the modal opens. Because a successful submit is
  // signalled by the parent closing the modal (isOpen -> false), resetting on
  // open — rather than synchronously after onSubmit — means a failed parent
  // mutation keeps the modal open with everything the user typed intact.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset form on open
      setFormData(DEFAULT_PARTICIPANT)
      setValidationError(null)
    }
  }, [isOpen])

  const handleClose = () => {
    setValidationError(null)
    onClose()
  }

  const handleSubmit = () => {
    if (!formData.userName || !formData.userEmail) {
      setValidationError('Please fill in both name and email.')
      return
    }
    setValidationError(null)
    onSubmit(formData)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      padded={false}
      className="relative overflow-hidden px-4 pt-5 pb-4 sm:p-6"
    >
      <div className="absolute top-0 right-0 pt-4 pr-4">
        <button
          type="button"
          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
          onClick={handleClose}
        >
          <span className="sr-only">Close</span>
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div>
        <DialogTitle
          as="h3"
          className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
        >
          Add Participant to {workshopTitle}
        </DialogTitle>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              value={formData.userName}
              onChange={(e) =>
                setFormData({ ...formData, userName: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email *
            </label>
            <input
              type="email"
              value={formData.userEmail}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  userEmail: e.target.value,
                })
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              WorkOS ID (optional)
            </label>
            <input
              type="text"
              value={formData.userWorkOSId}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  userWorkOSId: e.target.value,
                })
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              placeholder="user_abc123"
            />
          </div>

          <div>
            <Dropdown
              name="experienceLevel"
              label="Experience Level *"
              options={
                new Map([
                  ['beginner', 'Beginner'],
                  ['intermediate', 'Intermediate'],
                  ['advanced', 'Advanced'],
                ])
              }
              value={formData.experienceLevel}
              setValue={(val) =>
                setFormData({
                  ...formData,
                  experienceLevel: val as ExperienceLevel,
                })
              }
              required
            />
          </div>

          <div>
            <Dropdown
              name="operatingSystem"
              label="Operating System *"
              options={
                new Map([
                  ['windows', 'Windows'],
                  ['macos', 'macOS'],
                  ['linux', 'Linux'],
                ])
              }
              value={formData.operatingSystem}
              setValue={(val) =>
                setFormData({
                  ...formData,
                  operatingSystem: val as OperatingSystem,
                })
              }
              required
            />
          </div>
        </div>

        {validationError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {validationError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="blue"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Participant'}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
