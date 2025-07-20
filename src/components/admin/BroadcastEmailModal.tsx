'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/Button'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { useNotification } from './NotificationProvider'
import { XMarkIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'

interface BroadcastEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (subject: string, content: PortableTextBlock[]) => Promise<void>
  speakerCount: number
}

export function BroadcastEmailModal({
  isOpen,
  onClose,
  onSend,
  speakerCount,
}: BroadcastEmailModalProps) {
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState<PortableTextBlock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { showNotification } = useNotification()

  const handleSend = async () => {
    if (!subject.trim() || content.length === 0) {
      showNotification({
        type: 'warning',
        title: 'Missing information',
        message: 'Please provide both subject and content for the email.',
      })
      return
    }

    setIsLoading(true)
    try {
      await onSend(subject, content)
      setSubject('')
      setContent([])
      onClose()
    } catch (error) {
      console.error('Failed to send broadcast email:', error)
      showNotification({
        type: 'error',
        title: 'Failed to send email',
        message: 'Failed to send email. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-slate-gray/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-4xl space-y-6 rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-8 shadow-2xl">
          <div className="flex items-center justify-between border-b border-brand-frosted-steel pb-4">
            <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray">
              Send Email to Speakers
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
                This email will be sent to {speakerCount} confirmed and accepted
                speakers.
              </span>
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
              <label className="font-space-grotesk mb-2 block text-sm font-medium text-brand-slate-gray">
                Message
              </label>
              <div className="overflow-hidden rounded-xl border border-brand-frosted-steel bg-white">
                <PortableTextEditor
                  label=""
                  value={content}
                  onChange={setContent}
                />
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
              disabled={isLoading || !subject.trim() || content.length === 0}
              className="font-space-grotesk rounded-xl bg-brand-cloud-blue px-6 py-3 text-white transition-all duration-200 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </div>
              ) : (
                `Send to ${speakerCount} speakers`
              )}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
