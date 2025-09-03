'use client'

import { useMemo } from 'react'
import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'

interface GeneralBroadcastModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (subject: string, message: string) => Promise<void>
  onSyncContacts: () => Promise<void>
  recipientCount: number
  recipientType: string // 'speakers' or 'sponsors'
  fromEmail: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
}

export function GeneralBroadcastModal({
  isOpen,
  onClose,
  onSend,
  onSyncContacts,
  recipientCount,
  recipientType,
  fromEmail,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
}: GeneralBroadcastModalProps) {
  const { showNotification } = useNotification()

  // Memoize initial values to prevent unnecessary re-renders and form resets
  const initialValues = useMemo(
    () => ({
      subject: '',
      message: convertStringToPortableTextBlocks(
        'Hi {{{FIRST_NAME|there}}},\n\n',
      ),
    }),
    [], // Empty dependency array since these values should be static
  )

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    try {
      await onSend(subject, JSON.stringify(message)) // Send PortableText as JSON string
      showNotification({
        type: 'success',
        title: 'Email sent',
        message: `Email sent to ${recipientCount} ${recipientType}`,
      })
    } catch (error) {
      throw error // Let EmailModal handle the error
    }
  }

  // Custom recipient display with sync button
  const recipientDisplay = (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {recipientCount} confirmed {recipientType}
      </span>
      <button
        type="button"
        onClick={onSyncContacts}
        className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
      >
        <ArrowPathIcon className="h-3 w-3" />
        Sync
      </button>
    </div>
  )

  // Create preview component
  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    message: PortableTextBlock[]
    messageHTML: string
  }) => {
    return (
      <BroadcastTemplate
        content={
          <div
            className="text-base leading-relaxed text-gray-700 dark:text-gray-300"
            style={{
              fontSize: '16px',
              lineHeight: '1.6',
            }}
            dangerouslySetInnerHTML={{ __html: messageHTML }}
          />
        }
        subject={subject}
        eventName={eventName}
        eventLocation={eventLocation}
        eventDate={eventDate}
        eventUrl={eventUrl}
        socialLinks={socialLinks}
      />
    )
  }

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Broadcast Email"
      recipientInfo={recipientDisplay}
      onSend={handleSend}
      submitButtonText={`Send to ${recipientCount} ${recipientType}`}
      previewComponent={createPreview}
      fromAddress={fromEmail}
      initialValues={initialValues}
      placeholder={{
        subject: 'Enter broadcast subject...',
        message: 'Enter your message here...',
      }}
      helpText={`Use {{{FIRST_NAME|there}}} to personalize the greeting. This will be replaced with each ${recipientType.slice(0, -1)}&apos;s first name or &apos;there&apos; as a fallback.`}
    />
  )
}
