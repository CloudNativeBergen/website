'use client'

import { useState } from 'react'
import {
  VideoCameraIcon,
  DocumentArrowUpIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { VideoEmbed } from '@/components/VideoEmbed'
import { getVideoPlatform } from '@/lib/video/utils'
import { AttachmentManager } from '@/components/proposal/AttachmentManager'
import { Attachment } from '@/lib/attachment/types'
import { getNonUrlRecordingAttachments } from '@/lib/attachment/filters'

interface ProposalPublishedContentProps {
  proposalId: string
  currentVideoUrl?: string | null
  currentAttachments?: Attachment[]
  status: string
  conferenceEndDate?: string
}

export function ProposalPublishedContent({
  proposalId,
  currentVideoUrl,
  currentAttachments = [],
  status,
  conferenceEndDate,
}: ProposalPublishedContentProps) {
  const [isEditingVideo, setIsEditingVideo] = useState(false)
  const [videoUrl, setVideoUrl] = useState(currentVideoUrl || '')
  const [videoError, setVideoError] = useState<string | null>(null)
  const [attachments, setAttachments] =
    useState<Attachment[]>(currentAttachments)
  const { showNotification } = useNotification()

  const utils = api.useUtils()

  const updateVideoUrlMutation =
    api.proposal.admin.updateAttachments.useMutation({
      onSuccess: () => {
        showNotification({
          title: 'Video URL Updated',
          message: 'The video URL has been updated successfully.',
          type: 'success',
        })
        setIsEditingVideo(false)
        utils.proposal.admin.getById.invalidate({ id: proposalId })
      },
      onError: (error: { message?: string }) => {
        showNotification({
          title: 'Update Failed',
          message: error.message || 'Failed to update video URL.',
          type: 'error',
        })
      },
    })

  const updateAttachmentsMutation = api.proposal.updateAttachments.useMutation({
    onSuccess: () => {
      showNotification({
        title: 'Attachments Updated',
        message: 'Attachments have been updated successfully.',
        type: 'success',
      })
      utils.proposal.admin.getById.invalidate({ id: proposalId })
    },
    onError: (error: { message?: string }) => {
      showNotification({
        title: 'Update Failed',
        message: error.message || 'Failed to update attachments.',
        type: 'error',
      })
    },
  })

  const deleteAttachmentMutation =
    api.proposal.admin.deleteAttachment.useMutation({
      onSuccess: () => {
        showNotification({
          title: 'Attachment Deleted',
          message: 'The attachment has been deleted successfully.',
          type: 'success',
        })
        utils.proposal.admin.getById.invalidate({ id: proposalId })
      },
      onError: (error: { message?: string }) => {
        showNotification({
          title: 'Delete Failed',
          message: error.message || 'Failed to delete attachment.',
          type: 'error',
        })
      },
    })

  if (status !== 'accepted' && status !== 'confirmed') {
    return null
  }

  const conferenceHasEnded = conferenceEndDate
    ? new Date(conferenceEndDate) < new Date()
    : false

  if (!conferenceHasEnded) {
    return null
  }

  const validateVideoUrl = (url: string): boolean => {
    if (!url) return true // Empty is valid (removes video)

    try {
      const urlObj = new URL(url)
      const isYouTube =
        urlObj.hostname.includes('youtube.com') ||
        urlObj.hostname.includes('youtu.be')
      const isVimeo = urlObj.hostname.includes('vimeo.com')

      if (!isYouTube && !isVimeo) {
        setVideoError('Please enter a YouTube or Vimeo URL')
        return false
      }

      setVideoError(null)
      return true
    } catch {
      setVideoError('Please enter a valid URL')
      return false
    }
  }

  const handleSaveVideo = () => {
    if (!validateVideoUrl(videoUrl)) return

    // Update attachments: remove old recording URLs and add new one
    const nonRecordingAttachments = getNonUrlRecordingAttachments(attachments)

    const updatedAttachments = videoUrl
      ? [
          ...nonRecordingAttachments,
          {
            _type: 'urlAttachment' as const,
            _key: `recording-${Date.now()}`,
            url: videoUrl,
            attachmentType: 'recording' as const,
            title: 'Session Recording',
            uploadedAt: new Date().toISOString(),
          },
        ]
      : nonRecordingAttachments

    updateVideoUrlMutation.mutate({
      id: proposalId,
      attachments: updatedAttachments,
    })

    setAttachments(updatedAttachments)
  }

  const handleCancelVideo = () => {
    setVideoUrl(currentVideoUrl || '')
    setVideoError(null)
    setIsEditingVideo(false)
  }

  const handleAttachmentsChange = async (newAttachments: Attachment[]) => {
    setAttachments(newAttachments)
    await updateAttachmentsMutation.mutateAsync({
      id: proposalId,
      attachments: newAttachments,
    })
  }

  const handleDeleteAttachment = async (attachmentKey: string) => {
    const previousAttachments = attachments

    // Optimistically remove from UI
    setAttachments(attachments.filter((a) => a._key !== attachmentKey))

    try {
      await deleteAttachmentMutation.mutateAsync({
        id: proposalId,
        attachmentKey,
      })
    } catch {
      // Revert on error
      setAttachments(previousAttachments)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
        Published Content
      </h3>
      <div className="space-y-4">
        {/* Video Embed */}
        {videoUrl && !isEditingVideo && getVideoPlatform(videoUrl) && (
          <div className="mb-4">
            <VideoEmbed url={videoUrl} title="Talk Recording" />
          </div>
        )}

        {/* Video URL Section */}
        <div>
          <dt className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
            <VideoCameraIcon className="mr-2 h-4 w-4" />
            Recording
          </dt>
          <dd className="mt-2">
            {isEditingVideo ? (
              <div className="space-y-2">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value)
                    setVideoError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !videoError) {
                      e.preventDefault()
                      handleSaveVideo()
                    }
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                />
                {videoError && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {videoError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveVideo}
                    disabled={updateVideoUrlMutation.isPending || !!videoError}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    <CheckIcon className="h-3 w-3" />
                    {updateVideoUrlMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelVideo}
                    disabled={updateVideoUrlMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                  >
                    <XMarkIcon className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                {videoUrl ? (
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    <VideoCameraIcon className="h-4 w-4" />
                    <span className="underline">
                      {getVideoPlatform(videoUrl) === 'youtube'
                        ? 'YouTube video'
                        : getVideoPlatform(videoUrl) === 'vimeo'
                          ? 'Vimeo video'
                          : 'View Recording'}
                    </span>
                  </a>
                ) : (
                  <span className="text-sm text-gray-500 italic dark:text-gray-400">
                    No recording added
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingVideo(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                  title="Edit video URL"
                >
                  <PencilIcon className="h-3 w-3" />
                  Edit
                </button>
              </div>
            )}
          </dd>
        </div>

        {/* Slides & Attachments Section */}
        <div>
          <dt className="mb-3 flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
            <DocumentArrowUpIcon className="mr-2 h-4 w-4" />
            Presentation Slides & Resources
          </dt>
          <dd>
            <AttachmentManager
              proposalId={proposalId}
              attachments={attachments}
              onAttachmentsChange={handleAttachmentsChange}
              onDeleteAttachment={handleDeleteAttachment}
            />
          </dd>
        </div>
      </div>
    </div>
  )
}
