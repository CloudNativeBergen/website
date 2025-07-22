'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/Button'
import { useNotification } from './NotificationProvider'
import { XMarkIcon, EnvelopeIcon } from '@heroicons/react/24/outline'

export interface EmailModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  recipientInfo: string | React.ReactNode
  contextInfo?: string
  onSend: (data: { subject: string; message: string }) => Promise<void>
  submitButtonText?: string
  helpText?: string
  placeholder?: {
    subject?: string
    message?: string
  }
}

export function EmailModal({
  isOpen,
  onClose,
  title,
  recipientInfo,
  contextInfo,
  onSend,
  submitButtonText = 'Send Email',
  helpText,
  placeholder = {},
}: EmailModalProps) {
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
      await onSend({ subject, message })

      // Reset form and close modal on success
      setSubject('')
      setMessage('')
      onClose()
    } catch (error) {
      console.error('Failed to send email:', error)
      showNotification({
        type: 'error',
        title: 'Failed to send email',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setSubject('')
      setMessage('')
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-slate-gray/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl space-y-6 rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-8 shadow-2xl">
          <div className="flex items-center justify-between border-b border-brand-frosted-steel pb-4">
            <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray">
              {title}
            </DialogTitle>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-xl p-2 transition-colors duration-200 hover:bg-brand-sky-mist disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XMarkIcon className="h-5 w-5 text-brand-slate-gray" />
            </button>
          </div>

          <div className="font-inter rounded-xl border border-primary-200 bg-brand-sky-mist p-4 text-sm text-brand-slate-gray">
            <div className="flex items-start gap-2">
              <EnvelopeIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-cloud-blue" />
              <div className="min-w-0 flex-1">
                {typeof recipientInfo === 'string' ? (
                  <span className="font-medium">{recipientInfo}</span>
                ) : (
                  recipientInfo
                )}
              </div>
            </div>
            {contextInfo && (
              <div className="mt-2 text-xs text-brand-slate-gray/70">
                {contextInfo}
              </div>
            )}
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
                placeholder={placeholder.subject || 'Enter email subject...'}
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
                className="font-inter w-full resize-none rounded-xl border border-brand-frosted-steel bg-white px-4 py-3 shadow-sm transition-all duration-200 focus:border-brand-cloud-blue focus:ring-2 focus:ring-brand-cloud-blue"
                placeholder={
                  placeholder.message || 'Type your message to the recipient...'
                }
                disabled={isLoading}
              />
              <div className="mt-2 text-xs text-brand-slate-gray/70">
                {helpText ||
                  'The email will include additional context and conference details.'}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4 border-t border-brand-frosted-steel pt-6">
            <Button
              variant="outline"
              onClick={handleClose}
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
                submitButtonText
              )}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
