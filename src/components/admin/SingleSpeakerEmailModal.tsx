'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/Button'
import { useNotification } from './NotificationProvider'
import {
  XMarkIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
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
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { showNotification } = useNotification()

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing information',
        message: 'Please provide both subject and message for the email.',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/email-speaker', {
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

      // Reset form and close modal
      setSubject('')
      setMessage('')
      onClose()

    } catch (error) {
      console.error('Failed to send email:', error)
      showNotification({
        type: 'error',
        title: 'Failed to send email',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-slate-gray/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl space-y-6 rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-8 shadow-2xl">
          <div className="flex items-center justify-between border-b border-brand-frosted-steel pb-4">
            <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray">
              Email Speaker
            </DialogTitle>
            <button
              onClick={onClose}
              className="rounded-xl p-2 transition-colors duration-200 hover:bg-brand-sky-mist"
            >
              <XMarkIcon className="h-5 w-5 text-brand-slate-gray" />
            </button>
          </div>

          <div className="font-inter rounded-xl border border-primary-200 bg-brand-sky-mist p-4 text-sm text-brand-slate-gray">
            <div className="flex items-center gap-2">
              <EnvelopeIcon className="h-4 w-4 text-brand-cloud-blue" />
              <span className="font-medium">
                Sending email to {speakerName} ({speakerEmail})
              </span>
            </div>
            <div className="mt-2 text-xs text-brand-slate-gray/70">
              <strong>Proposal:</strong> {proposal.title}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label
                htmlFor="subject"
                className="font-space-grotesk mb-2 block text-sm font-medium text-brand-slate-gray"
              >
                Subject
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="font-inter w-full rounded-xl border border-brand-frosted-steel bg-white px-4 py-3 shadow-sm transition-all duration-200 focus:border-brand-cloud-blue focus:ring-2 focus:ring-brand-cloud-blue"
                placeholder="Enter email subject..."
                disabled={isLoading}
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="font-space-grotesk mb-2 block text-sm font-medium text-brand-slate-gray"
              >
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="font-inter w-full rounded-xl border border-brand-frosted-steel bg-white px-4 py-3 shadow-sm transition-all duration-200 focus:border-brand-cloud-blue focus:ring-2 focus:ring-brand-cloud-blue resize-none"
                placeholder="Type your message to the speaker..."
                disabled={isLoading}
              />
              <div className="mt-2 text-xs text-brand-slate-gray/70">
                The email will include a link to the proposal and conference details.
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4 border-t border-brand-frosted-steel pt-6">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="font-space-grotesk rounded-xl border-brand-frosted-steel px-6 py-3 text-brand-slate-gray transition-all duration-200 hover:bg-brand-sky-mist"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isLoading || !subject.trim() || !message.trim()}
              className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-3 text-white transition-all duration-200 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </div>
              ) : (
                `Send Email`
              )}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}