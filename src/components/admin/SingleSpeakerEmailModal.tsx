'use client'

import { useNotification } from './NotificationProvider'
import { EmailModal } from './EmailModal'
import { ProposalExisting } from '@/lib/proposal/types'

interface SingleSpeakerEmailModalProps {
  isOpen: boolean
  onClose: () => void
  proposal: ProposalExisting
  speakerId: string
  speakerName: string
  speakerEmail: string
}

export function SingleSpeakerEmailModal({
  isOpen,
  onClose,
  proposal,
  speakerId,
  speakerName,
  speakerEmail,
}: SingleSpeakerEmailModalProps) {
  const { showNotification } = useNotification()

  const handleSend = async ({ subject, message }: { subject: string; message: string }) => {
    const response = await fetch('/admin/api/speakers/email/single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proposalId: proposal._id,
        speakerId,
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
      message: `Email sent to ${speakerName} (${speakerEmail})`,
    })
  }

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Speaker"
      recipientInfo={`Sending email to ${speakerName} (${speakerEmail})`}
      contextInfo={`Proposal: ${proposal.title}`}
      onSend={handleSend}
      submitButtonText="Send Email"
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Type your message to the speaker...',
      }}
    />
  )
}