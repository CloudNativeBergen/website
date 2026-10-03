/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModalShell } from '@/components/ModalShell'
import { api } from '@/lib/trpc/client'
import { Button } from '@headlessui/react' // or whatever button they use

interface SponsorCreateModalProps {
  isOpen: boolean
  onClose: () => void
  conferenceId: string
}

export function SponsorCreateModal({
  isOpen,
  onClose,
  conferenceId,
}: SponsorCreateModalProps) {
  const router = useRouter()
  const [sponsorName, setSponsorName] = useState('')
  const utils = api.useUtils()

  const createMutation = api.sponsor.crm.create.useMutation({
    onSuccess: (data) => {
      utils.sponsor.crm.list.invalidate()
      onClose()
      if (data && data._id) {
        router.push(`/admin/sponsors/${data._id}`)
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sponsorName.trim()) return

    // In a real implementation this would likely use the existing combobox
    // to find an organization or create a new one, similar to what
    // SponsorPipelineView did. For this scaffolding, we simulate the action.
    alert(
      'This would create a new organization: ' +
        sponsorName +
        ' and redirect to its dashboard.',
    )
    onClose()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Add New Sponsor">
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div>
          <label
            htmlFor="sponsorName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Sponsor Name
          </label>
          <input
            type="text"
            id="sponsorName"
            value={sponsorName}
            onChange={(e) => setSponsorName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="e.g. Acme Corp"
            required
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !sponsorName.trim()}
            className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Sponsor'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
