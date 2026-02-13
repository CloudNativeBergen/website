'use client'

import { useState, useEffect } from 'react'
import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'

interface EditCapacityModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  currentCapacity: number
  currentSignups: number
  onSubmit: (capacity: number) => void
  isSubmitting?: boolean
}

export function EditCapacityModal({
  isOpen,
  onClose,
  workshopTitle,
  currentCapacity,
  currentSignups,
  onSubmit,
  isSubmitting = false,
}: EditCapacityModalProps) {
  const [capacity, setCapacity] = useState(currentCapacity)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync capacity with current value on modal open
    setCapacity(currentCapacity)
  }, [currentCapacity, isOpen])

  const handleSubmit = () => {
    if (capacity < currentSignups) {
      alert(`Capacity cannot be less than current signups (${currentSignups})`)
      return
    }
    onSubmit(capacity)
  }

  const availableSpots = Math.max(0, capacity - currentSignups)
  const isInvalid = capacity < currentSignups

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      padded={false}
      className="relative overflow-hidden px-4 pt-5 pb-4 sm:p-6"
    >
      <div className="absolute top-0 right-0 pt-4 pr-4">
        <button
          type="button"
          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
          onClick={onClose}
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
          Edit Workshop Capacity
        </DialogTitle>

        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {workshopTitle}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Currently {currentSignups} confirmed participants
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Maximum Capacity
            </label>
            <input
              type="number"
              min={currentSignups}
              value={capacity || 0}
              onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            {isInvalid && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Capacity cannot be less than current signups ({currentSignups})
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Available spots: {availableSpots}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="blue"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || isInvalid}
          >
            {isSubmitting ? 'Updating...' : 'Update Capacity'}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
