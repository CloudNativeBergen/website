'use client'

import { useMemo } from 'react'
import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { SpeakerBroadcastTemplate } from '@/components/email/SpeakerBroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal/validation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface BroadcastEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (subject: string, message: string) => Promise<void>
  onSyncContacts: () => Promise<void>
  speakerCount: number
  fromEmail: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
}

export function BroadcastEmailModal({
  isOpen,
  onClose,
  onSend,
  onSyncContacts,
  speakerCount,
  fromEmail,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
}: BroadcastEmailModalProps) {
  const { showNotification } = useNotification()

  // Memoize initial values to prevent unnecessary re-renders and form resets
  const initialValues = useMemo(
    () => ({
      subject: '',
      message: convertStringToPortableTextBlocks(
        'Hi {{{FIRST_NAME|here}}},\n\n',
      ),
    }),
    [], // Empty dependency array since these values should be static
  )

  const handleSend = async ({
    subject,
    messageHTML,
  }: {
    subject: string
    message: string
    messageHTML: string
  }) => {
    try {
      await onSend(subject, messageHTML) // Use HTML version for email
      showNotification({
        type: 'success',
        title: 'Email sent',
        message: `Email sent to ${speakerCount} speakers`,
      })
    } catch (error) {
      throw error // Let EmailModal handle the error
    }
  }

  // Custom recipient display with sync button
  const recipientDisplay = (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">
        {speakerCount} confirmed speakers
      </span>
      <button
        type="button"
        onClick={onSyncContacts}
        className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-200"
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
    message: string
    messageHTML: string
  }) => {
    return (
      <SpeakerBroadcastTemplate
        content={
          <div
            style={{
              fontSize: '16px',
              lineHeight: '1.6',
              color: '#334155',
            }}
            dangerouslySetInnerHTML={{ __html: messageHTML }}
          />
        }
        subject={subject}
        speakerName="" // Empty to avoid showing hard-coded greeting
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
      submitButtonText={`Send to ${speakerCount} speakers`}
      previewComponent={createPreview}
      fromAddress={fromEmail}
      initialValues={initialValues}
      placeholder={{
        subject: 'Enter broadcast subject...',
        message: 'Enter your message here...',
      }}
      helpText="Use {{{FIRST_NAME|there}}} to personalize the greeting. This will be replaced with each speaker's first name or 'there' as a fallback."
    />
  )
}
