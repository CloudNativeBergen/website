'use client'

import { useState, useEffect } from 'react'
import { BellIcon } from '@heroicons/react/20/solid'
import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { ProposalExisting } from '@/lib/proposal/types'
import { SpeakerEmailTemplate } from '@/components/email/SpeakerEmailTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { PortableTextBlock } from '@portabletext/editor'

interface SpeakerEmailModalProps {
  isOpen: boolean
  onClose: () => void
  proposal: ProposalExisting
  speakers: Array<{
    id: string
    name: string
    email: string
  }>
  domain?: string
  fromEmail: string
}

export function SpeakerEmailModal({
  isOpen,
  onClose,
  proposal,
  speakers,
  domain,
  fromEmail,
}: SpeakerEmailModalProps) {
  const { showNotification } = useNotification()
  const [initialMessage, setInitialMessage] = useState<PortableTextBlock[]>([])

  const recipientDisplay = (
    <div className="flex flex-wrap gap-2">
      {speakers.map((speaker, index) => (
        <span
          key={index}
          className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray"
        >
          {speaker.name} &lt;{speaker.email}&gt;
        </span>
      ))}
    </div>
  )

  // Generate greeting for the message
  const speakerNames = speakers.map((s) => s.name)
  const greetingNames =
    speakerNames.length === 1
      ? speakerNames[0]
      : speakerNames.length === 2
        ? speakerNames.join(' and ')
        : speakerNames.slice(0, -1).join(', ') +
          ', and ' +
          speakerNames[speakerNames.length - 1]

  // Set initial message with greeting when modal opens
  useEffect(() => {
    if (isOpen) {
      const greeting = `Dear ${greetingNames},\n\n`
      const portableTextBlocks = convertStringToPortableTextBlocks(greeting)
      setInitialMessage(portableTextBlocks)
    }
  }, [isOpen, greetingNames])

  // Generate default subject
  const conference = proposal.conference
  const conferenceName =
    conference && typeof conference === 'object' && !('_ref' in conference)
      ? conference.title
      : 'our conference'
  const defaultSubject = `Regarding your proposal for ${conferenceName}`

  const handleSend = async ({
    subject,
    messageHTML,
  }: {
    subject: string
    message: string
    messageHTML: string
  }) => {
    // Use the multi-speaker endpoint for all cases
    const response = await fetch('/admin/api/speakers/email/multi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proposalId: proposal._id,
        speakerIds: speakers.map((s) => s.id),
        subject,
        message: messageHTML, // Use the HTML version for email
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to send email')
    }

    await response.json()

    showNotification({
      type: 'success',
      title: 'Email sent successfully',
      message: `Email sent to ${speakers.length} speaker${speakers.length > 1 ? 's' : ''}`,
    })
  }

  const localhostWarning =
    domain && domain.includes('localhost') ? (
      <div className="rounded-md bg-yellow-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <BellIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Development Environment Warning
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                You are running on localhost. Email notifications will contain
                invalid links pointing to localhost URLs that speakers cannot
                access.
              </p>
            </div>
          </div>
        </div>
      </div>
    ) : undefined

  // Create preview component
  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    message: string
    messageHTML: string
  }) => {
    // Extract conference information with type guard
    const conference = proposal.conference
    if (!conference || typeof conference !== 'object' || '_ref' in conference) {
      return <div>Conference information not available for preview</div>
    }

    return (
      <SpeakerEmailTemplate
        speakers={speakers.map((s) => ({ name: s.name, email: s.email }))}
        proposalTitle={proposal.title}
        proposalUrl={`https://${domain}/admin/proposals/${proposal._id}`}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={conference.start_date || 'TBD'}
        eventUrl={`https://${domain}/`}
        subject={subject}
        message={messageHTML} // Use the HTML version for proper formatting
        senderName="Conference Team"
        socialLinks={conference.social_links || []}
      />
    )
  }

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose Email"
      recipientInfo={recipientDisplay}
      contextInfo={`Email about: ${proposal.title}`}
      onSend={handleSend}
      submitButtonText="Send Email"
      warningContent={localhostWarning}
      previewComponent={createPreview}
      fromAddress={fromEmail}
      initialValues={{
        subject: defaultSubject,
        message: initialMessage,
      }}
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Enter your message here...',
      }}
      helpText="The email will automatically include proposal details and conference information."
    />
  )
}
