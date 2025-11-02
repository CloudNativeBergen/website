import {
  DocumentIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { Attachment } from '@/lib/attachment/types'
import { getRecordingAttachments } from '@/lib/attachment/filters'
import { VideoEmbed } from '@/components/VideoEmbed'
import { getVideoPlatform } from '@/lib/video/utils'

interface AttachmentDisplayProps {
  attachments: Attachment[]
  showVideos?: boolean
}

const attachmentTypeLabels = {
  slides: 'Slides',
  recording: 'Recording',
  resource: 'Resource',
}

export function AttachmentDisplay({
  attachments,
  showVideos = true,
}: AttachmentDisplayProps) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  const slides = attachments.filter((a) => a.attachmentType === 'slides')
  const recordings = getRecordingAttachments(attachments)
  const resources = attachments.filter((a) => a.attachmentType === 'resource')

  const renderAttachment = (attachment: Attachment) => {
    const displayTitle =
      attachment.title ||
      (attachment._type === 'fileAttachment'
        ? attachment.filename
        : attachment._type === 'urlAttachment'
          ? attachment.url
          : 'Untitled')

    const typeLabel = attachmentTypeLabels[attachment.attachmentType]

    return (
      <div
        key={attachment._key}
        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-center space-x-3">
          {attachment._type === 'fileAttachment' ? (
            <DocumentIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <LinkIcon className="h-5 w-5 text-gray-400" />
          )}
          <div>
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {displayTitle}
              </p>
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                {typeLabel}
              </span>
            </div>
            {attachment.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {attachment.description}
              </p>
            )}
          </div>
        </div>
        {attachment._type === 'urlAttachment' ? (
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <span>Open</span>
            <ArrowDownTrayIcon className="h-4 w-4" />
          </a>
        ) : attachment._type === 'fileAttachment' && attachment.url ? (
          <a
            href={attachment.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <span>Download</span>
            <ArrowDownTrayIcon className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    )
  }

  const videoRecordings = showVideos
    ? recordings.filter(
        (a) => a._type === 'urlAttachment' && getVideoPlatform(a.url),
      )
    : []

  const nonVideoRecordings = recordings.filter(
    (a) => a._type !== 'urlAttachment' || !getVideoPlatform(a.url),
  )

  const renderVideoEmbeds = () => {
    if (!showVideos || videoRecordings.length === 0) return null

    return (
      <div className="space-y-4">
        {videoRecordings.map((recording) => {
          if (recording._type !== 'urlAttachment') return null

          return (
            <div key={recording._key}>
              {recording.title && (
                <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  {recording.title}
                </h4>
              )}
              <VideoEmbed url={recording.url} />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {slides.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Presentation Slides
          </h4>
          <div className="space-y-2">{slides.map(renderAttachment)}</div>
        </div>
      )}

      {recordings.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            <VideoCameraIcon className="mr-2 inline-block h-4 w-4" />
            Session Recordings
          </h4>
          <div className="space-y-4">
            {renderVideoEmbeds()}
            {nonVideoRecordings.length > 0 && (
              <div className="space-y-2">
                {nonVideoRecordings.map(renderAttachment)}
              </div>
            )}
          </div>
        </div>
      )}

      {resources.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Additional Resources
          </h4>
          <div className="space-y-2">{resources.map(renderAttachment)}</div>
        </div>
      )}
    </div>
  )
}
