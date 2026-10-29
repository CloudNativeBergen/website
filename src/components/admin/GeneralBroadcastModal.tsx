'use client'

import { useMemo, type ReactNode } from 'react'
import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'
import {
  findUnsupportedVariables,
  formatUnmergedVariablesMessage,
  RESEND_BROADCAST_VARIABLES,
} from '@/lib/sponsor/templates'
import type { PortableTextBlock as TemplateBlock } from '@/lib/sponsor/types'

function expandPreviewBroadcastVariables(value: string): string {
  return value.replace(
    /\{\{\{\s*([A-Z0-9_]+)(?:\|([^}]*))?\s*\}\}\}/g,
    (match, varName: string, fallback?: string) => {
      if (!(varName in RESEND_BROADCAST_VARIABLES)) return match
      if (fallback !== undefined && fallback.length > 0) return fallback
      switch (varName) {
        case 'FIRST_NAME':
          return 'there'
        case 'LAST_NAME':
          return ''
        case 'EMAIL':
          return 'recipient@example.com'
        case 'RESEND_UNSUBSCRIBE_URL':
          return '#unsubscribe'
        default:
          return match
      }
    },
  )
}

interface GeneralBroadcastModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (subject: string, message: string) => Promise<void>
  onSyncContacts: () => Promise<void>
  recipientCount: number
  recipientType: string
  fromEmail: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  /** Tenant brand primary (THEMING L1) for the preview and the sent email. */
  brandColor?: string
  /** Replaces the default count-and-sync line, e.g. with a recipient picker. */
  recipientInfo?: ReactNode
  title?: string
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
  brandColor,
  recipientInfo,
  title = 'Send Broadcast Email',
}: GeneralBroadcastModalProps) {
  const { showNotification } = useNotification()

  const initialValues = useMemo(
    () => ({
      subject: '',
      message: convertStringToPortableTextBlocks(
        'Hi {{{FIRST_NAME|there}}},\n\n',
      ),
    }),
    [],
  )

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    const unmergedVariables = findUnsupportedVariables(
      RESEND_BROADCAST_VARIABLES,
      subject,
      message as unknown as TemplateBlock[],
    )
    if (unmergedVariables.length > 0) {
      throw new Error(formatUnmergedVariablesMessage(unmergedVariables))
    }

    await onSend(subject, JSON.stringify(message))
    showNotification({
      type: 'success',
      title: 'Email sent',
      message: `Email sent to ${recipientCount} ${recipientType}`,
    })
  }

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

  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    message: PortableTextBlock[]
    messageHTML: string
  }) => {
    const expandedSubject = expandPreviewBroadcastVariables(subject)
    const expandedHTML = expandPreviewBroadcastVariables(messageHTML)
    return (
      <BroadcastTemplate
        content={
          <div
            className="text-base leading-relaxed text-gray-700"
            style={{
              fontSize: '16px',
              lineHeight: '1.6',
            }}
            dangerouslySetInnerHTML={{ __html: expandedHTML }}
          />
        }
        subject={expandedSubject}
        eventName={eventName}
        eventLocation={eventLocation}
        eventDate={eventDate}
        eventUrl={eventUrl}
        socialLinks={socialLinks}
        brandColor={brandColor}
      />
    )
  }

  const singularRecipient = recipientType.endsWith('s')
    ? recipientType.slice(0, -1)
    : recipientType

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      recipientInfo={recipientInfo ?? recipientDisplay}
      brandColor={brandColor}
      onSend={handleSend}
      submitButtonText={`Send to ${recipientCount} ${recipientType}`}
      storageKey={`broadcast-email-${recipientType}`}
      previewComponent={createPreview}
      fromAddress={fromEmail}
      initialValues={initialValues}
      placeholder={{
        subject: 'Enter broadcast subject...',
        message: 'Enter your message here...',
      }}
      helpText={`Use {{{FIRST_NAME|there}}} to personalize the greeting. This will be replaced with each ${singularRecipient}'s first name or 'there' as a fallback.`}
    />
  )
}
