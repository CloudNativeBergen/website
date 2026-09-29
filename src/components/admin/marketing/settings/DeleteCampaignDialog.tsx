'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { typeToConfirmMatches } from '@/components/admin/new-edition/wizardLogic'
import { api } from '@/lib/trpc/client'
import { LiveLinksWarning } from '../LiveLinksWarning'

export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  snapshots: number
  requiresTypedConfirmation: boolean
  /** Short links that may be live and fall back to the home page (§2.7). */
  liveLinks: number
  conferenceTitle: string
}
export function DeleteConfirmation({
  preview: lastPreview,
  error,
  previewError,
  pending = false,
  onClose,
  onConfirm,
  label = 'Campaign',
}: {
  preview?: DeletionPreview
  error?: string
  /** Only a refused/failed PREVIEW disables confirm; see confirmDisabled. */
  previewError?: string
  pending?: boolean
  onClose: () => void
  onConfirm: (title: string) => void
  label?: string
}) {
  const [title, setTitle] = useState('')
  // React Query keeps the last data beside a refetch error: counts and a
  // live-link warning from an earlier read must not sit next to that error.
  const preview = previewError ? undefined : lastPreview
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
      /*
       * A failed DELETE must not wedge the dialog. `error` carries two very
       * different things: a preview that refused (no validated plan to act on
       * — stay disabled) and a delete attempt that failed (the preview is
       * still good — the organizer must be able to try again). Disabling on
       * both meant one transient failure forced a close-and-reopen.
       */
      confirmDisabled={
        !preview ||
        !!previewError ||
        (preview.requiresTypedConfirmation &&
          !typeToConfirmMatches(title, preview.conferenceTitle))
      }
    >
      {/* The error is a BANNER, not a replacement. Swapping the body out hid
          the itemised counts and the type-to-confirm input while leaving
          Confirm enabled — so after a failed delete the organizer could re-fire
          an irreversible action with no summary of what it destroys and no way
          to re-read or correct the title they had typed. */}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {preview && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-left text-sm text-gray-900 dark:text-gray-100">
          <li>
            {preview.campaigns} Campaigns and {preview.tasks} Tasks permanently
            deleted
          </li>
          <li>
            {preview.publishedTasks} published posts kept, including their URLs
            and publication history
          </li>
          <li>{preview.snapshots} stored measurements preserved</li>
        </ul>
      )}
      {/* One live region from the first render, so a screen reader hears the
          warning replace the "checking" line (as in the Task dialog). */}
      <div role="status" className="mt-3 text-left text-sm empty:hidden">
        {preview ? (
          <LiveLinksWarning count={preview.liveLinks} />
        ) : // Not "checking" once it has refused — the banner above is the answer.
        previewError ? null : (
          'Checking Campaigns, Tasks and publications…'
        )}
      </div>
      {preview?.requiresTypedConfirmation && (
        <label className="mt-3 block text-left text-sm text-gray-900 dark:text-gray-100">
          Type &ldquo;{preview.conferenceTitle}&rdquo; to confirm
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
            autoComplete="off"
          />
        </label>
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
    { staleTime: 0, refetchOnWindowFocus: false },
  )
  const utils = api.useUtils()
  const router = useRouter()
  const mutation = api.marketing.campaign.delete.useMutation({
    onSuccess: () => {
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.report.invalidate()
      // Deleting removes unpublished task-owned posts and variants, so the
      // Social Posts list is stale too — it would keep showing drafts that no
      // longer exist until its next poll. Single-Task deletion and Task
      // creation already invalidate it.
      void utils.social.listVariants.invalidate()
      // The ledger for the Campaign that just went. Left fresh in the shared
      // cache, pressing Back within the window remounted it for a Campaign that
      // no longer exists instead of refetching into the not-found state.
      void utils.marketing.campaign.get.invalidate({ campaignId })
      router.push('/admin/marketing/settings')
      onClose()
    },
  })
  return (
    <DeleteConfirmation
      preview={preview.isFetching ? undefined : preview.data}
      error={preview.error?.message ?? mutation.error?.message}
      previewError={preview.error?.message}
      pending={mutation.isPending}
      onClose={onClose}
      onConfirm={(confirmTitle) =>
        mutation.mutate({ campaignId, confirmTitle })
      }
    />
  )
}
