'use client'

import { useState, useEffect } from 'react'
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
    // The inline error (isInvalid) and the disabled submit button already
    // surface this; guard silently rather than firing a native alert().
    if (capacity < currentSignups) {
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
      title="Edit Workshop Capacity"
      subtitle={workshopTitle}
      confirmOnDirtyClose
      isDirty={capacity !== currentCapacity && !isSubmitting}
    >
      <div>
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
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

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11"
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="brand"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || isInvalid}
            className="min-h-11"
          >
            {isSubmitting ? 'Updating...' : 'Update Capacity'}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
