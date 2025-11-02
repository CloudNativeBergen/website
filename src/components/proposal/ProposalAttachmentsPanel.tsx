'use client'

import { useState } from 'react'
import {
  DocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { AttachmentManager } from '@/components/proposal/AttachmentManager'
import { Attachment } from '@/lib/attachment/types'
import {
  getRecordingAttachments,
  getSlideAttachments,
} from '@/lib/attachment/filters'
import { api } from '@/lib/trpc/client'

interface ProposalAttachmentsPanelProps {
  proposalId: string
  initialAttachments?: Attachment[]
  readonly?: boolean
}

export function ProposalAttachmentsPanel({
  proposalId,
  initialAttachments = [],
  readonly = false,
}: ProposalAttachmentsPanelProps) {
  const [attachments, setAttachments] =
    useState<Attachment[]>(initialAttachments)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const utils = api.useUtils()

  const updateAttachmentsMutation = api.proposal.updateAttachments.useMutation({
    onSuccess: () => {
      setError(null)
      utils.proposal.getById.invalidate({ id: proposalId })
    },
    onError: (error: { message?: string }) => {
      setError(error.message || 'Failed to update attachments')
    },
  })

  const deleteAttachmentMutation = api.proposal.deleteAttachment.useMutation({
    onSuccess: () => {
      setError(null)
      setSuccessMessage('Attachment deleted successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
      utils.proposal.getById.invalidate({ id: proposalId })
    },
    onError: (error: { message?: string }) => {
      setError(error.message || 'Failed to delete attachment')
    },
  })

  const handleAttachmentsChange = async (newAttachments: Attachment[]) => {
    const recordingAttachments = getRecordingAttachments(attachments)
    const allAttachments = [...recordingAttachments, ...newAttachments]

    setAttachments(allAttachments)
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await updateAttachmentsMutation.mutateAsync({
        id: proposalId,
        attachments: allAttachments,
      })
    } catch (err) {
      console.error('Failed to save attachments:', err)
      setError('Failed to update attachments')
      // Revert on error
      setAttachments(attachments)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAttachment = async (attachmentKey: string) => {
    const previousAttachments = attachments

    // Optimistically remove from UI
    setAttachments(attachments.filter((a) => a._key !== attachmentKey))
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await deleteAttachmentMutation.mutateAsync({
        id: proposalId,
        attachmentKey,
      })
    } catch (err) {
      console.error('Failed to delete attachment:', err)
      // Revert on error
      setAttachments(previousAttachments)
    } finally {
      setIsSaving(false)
    }
  }

  const hasAttachments = getSlideAttachments(attachments).length > 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900 dark:text-white">
        <DocumentIcon className="mr-2 h-5 w-5" />
        Slides & Attachments
      </h3>

      {!readonly && !hasAttachments && (
        <div className="mb-4 rounded-lg border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/20">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-yellow-400 dark:text-yellow-600" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Slides not yet uploaded
              </h4>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Please upload your presentation materials for your session.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-4 dark:bg-green-900/20">
          <p className="text-sm text-green-800 dark:text-green-200">
            {successMessage}
          </p>
        </div>
      )}

      {isSaving && (
        <div className="mb-4 rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Saving changes...
          </p>
        </div>
      )}

      <AttachmentManager
        proposalId={proposalId}
        attachments={attachments}
        onAttachmentsChange={handleAttachmentsChange}
        onDeleteAttachment={handleDeleteAttachment}
        readonly={readonly}
      />
    </div>
  )
}
