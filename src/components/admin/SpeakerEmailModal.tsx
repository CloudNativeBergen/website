'use client'

import { BellIcon } from '@heroicons/react/20/solid'
import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { ProposalExisting } from '@/lib/proposal/types'

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
}

export function SpeakerEmailModal({
  isOpen,
  onClose,
  proposal,
  speakers,
  domain,
}: SpeakerEmailModalProps) {
  const { showNotification } = useNotification()

  const formattedRecipients = speakers.map((s) => `${s.name} <${s.email}>`)

  const recipientDisplay = (
    <div className="space-y-1">
      <div className="text-sm font-medium text-brand-slate-gray">
        Sending email to:
      </div>
      <div className="space-y-1">
        {formattedRecipients.map((recipient, index) => (
          <div key={index} className="text-sm text-brand-slate-gray/80">
            {recipient}
          </div>
        ))}
      </div>
    </div>
  )

  // Generate greeting for placeholder
  const speakerNames = speakers.map((s) => s.name)
  const greetingNames =
    speakerNames.length === 1
      ? speakerNames[0]
      : speakerNames.length === 2
        ? speakerNames.join(' and ')
        : speakerNames.slice(0, -1).join(', ') +
          ', and ' +
          speakerNames[speakerNames.length - 1]

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: string
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
        message,
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

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Email ${speakers.length > 1 ? 'All Speakers' : 'Speaker'}`}
      recipientInfo={recipientDisplay}
      contextInfo={`Proposal: ${proposal.title}`}
      onSend={handleSend}
      submitButtonText="Send Email"
      warningContent={localhostWarning}
      placeholder={{
        subject: 'Enter email subject...',
        message: `Your message will appear after "Dear ${greetingNames}"...`,
      }}
      helpText="The email will automatically include a greeting, proposal details, and conference information."
    />
  )
}
