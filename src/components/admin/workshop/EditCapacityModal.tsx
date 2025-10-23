'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

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
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-75 dark:bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity dark:bg-gray-900" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6 dark:bg-gray-800">
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
                  <Dialog.Title
                    as="h3"
                    className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
                  >
                    Edit Workshop Capacity
                  </Dialog.Title>

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
                        onChange={(e) =>
                          setCapacity(parseInt(e.target.value) || 0)
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                      {isInvalid && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          Capacity cannot be less than current signups (
                          {currentSignups})
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Available spots: {availableSpots}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      onClick={onClose}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleSubmit}
                      disabled={isSubmitting || isInvalid}
                    >
                      {isSubmitting ? 'Updating...' : 'Update Capacity'}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
