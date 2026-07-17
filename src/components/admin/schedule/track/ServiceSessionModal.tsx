'use client'

import React, { useCallback, useState } from 'react'
import { Dropdown } from '@/components/Form'

interface ServiceSessionModalProps {
  isOpen: boolean
  timeSlot: string
  onClose: () => void
  onSave: (title: string, duration: number) => void
}

export const ServiceSessionModal = ({
  isOpen,
  timeSlot,
  onClose,
  onSave,
}: ServiceSessionModalProps) => {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(10)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (title.trim()) {
        onSave(title.trim(), duration)
        setTitle('')
        setDuration(10)
      }
    },
    [title, duration, onSave],
  )

  const handleClose = useCallback(() => {
    setTitle('')
    setDuration(10)
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Create Service Session
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Starting at {timeSlot}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Session Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="e.g., Coffee Break, Lunch, Networking"
              required
              autoFocus
            />
          </div>

          <div>
            <Dropdown
              name="duration"
              label="Duration (minutes)"
              options={
                new Map([
                  ['5', '5 minutes'],
                  ['10', '10 minutes'],
                  ['15', '15 minutes'],
                  ['20', '20 minutes'],
                  ['30', '30 minutes'],
                  ['45', '45 minutes'],
                  ['60', '60 minutes'],
                  ['90', '90 minutes'],
                ])
              }
              value={String(duration)}
              setValue={(val) => setDuration(Number(val))}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Create Session
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
