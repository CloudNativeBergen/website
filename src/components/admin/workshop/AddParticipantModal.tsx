'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { Dropdown } from '@/components/Form'
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

  const handleClose = () => {
    setFormData(DEFAULT_PARTICIPANT)
    onClose()
  }

  const handleSubmit = () => {
    if (!formData.userName || !formData.userEmail) {
      alert('Please fill in all required fields')
      return
    }
    onSubmit(formData)
    setFormData(DEFAULT_PARTICIPANT)
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

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Participant'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
