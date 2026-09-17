'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { typeToConfirmMatches } from '@/components/admin/new-edition/wizardLogic'
import { api } from '@/lib/trpc/client'

export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  snapshots: number
  requiresTypedConfirmation: boolean
  conferenceTitle: string
}
export function DeleteConfirmation({
  preview,
  error,
  pending = false,
  onClose,
  onConfirm,
  label = 'Campaign',
}: {
  preview?: DeletionPreview
  error?: string
  pending?: boolean
  onClose: () => void
  onConfirm: (title: string) => void
  label?: string
}) {
  const [title, setTitle] = useState('')
  return (
    <ConfirmationModal
      isOpen
      onClose={pending ? () => {} : onClose}
      onConfirm={() =>
        onConfirm(
          preview && typeToConfirmMatches(title, preview.conferenceTitle)
            ? preview.conferenceTitle
            : title,
        )
      }
      title={`Delete ${label}?`}
      message="The selected plan structure is permanently removed. Published posts and measurement history are preserved."
      confirmButtonText={`Delete ${label}`}
      isLoading={pending}
      confirmDisabled={
        !preview ||
        !!error ||
        (preview.requiresTypedConfirmation &&
          !typeToConfirmMatches(title, preview.conferenceTitle))
      }
    >
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      ) : !preview ? (
        <p className="mt-4 text-sm">
          Checking Campaigns, Tasks and publications…
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-left text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {preview.campaigns} Campaigns and {preview.tasks} Tasks
              permanently deleted
            </li>
            <li>
              {preview.publishedTasks} published posts kept, including their
              URLs and publication history
            </li>
            <li>{preview.snapshots} stored measurements preserved</li>
          </ul>
          {preview.requiresTypedConfirmation && (
            <label className="block">
              Type &ldquo;{preview.conferenceTitle}&rdquo; to confirm
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                autoComplete="off"
              />
            </label>
          )}
        </div>
      )}
    </ConfirmationModal>
  )
}
export function DeleteCampaignDialog({
  campaignId,
  onClose,
}: {
  campaignId: string
  onClose: () => void
}) {
  const preview = api.marketing.campaign.deletionPreview.useQuery(
    { campaignId },
    { refetchOnWindowFocus: false },
  )
  const utils = api.useUtils()
  const router = useRouter()
  const mutation = api.marketing.campaign.delete.useMutation({
    onSuccess: () => {
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.report.invalidate()
      router.push('/admin/marketing/settings')
      onClose()
    },
  })
  return (
    <DeleteConfirmation
      preview={preview.isFetching ? undefined : preview.data}
      error={preview.error?.message ?? mutation.error?.message}
      pending={mutation.isPending}
      onClose={onClose}
      onConfirm={(confirmTitle) =>
        mutation.mutate({ campaignId, confirmTitle })
      }
    />
  )
}
