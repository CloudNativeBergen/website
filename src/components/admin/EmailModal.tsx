'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/Button'
import { useNotification } from './NotificationProvider'
import { XMarkIcon, EyeIcon } from '@heroicons/react/24/outline'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'

export interface EmailModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  recipientInfo: string | React.ReactNode
  contextInfo?: string
  onSend: (data: {
    subject: string
    message: PortableTextBlock[]
  }) => Promise<void>
  submitButtonText?: string
  helpText?: string
  warningContent?: React.ReactNode
  placeholder?: {
    subject?: string
    message?: string
  }
  initialValues?: {
    subject?: string
    message?: string | PortableTextBlock[]
  }
  previewComponent?: (data: {
    subject: string
    message: PortableTextBlock[]
    messageHTML: string
  }) => React.ReactNode
  fromAddress: string
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
  warningContent,
  placeholder = {},
  initialValues = {},
  previewComponent,
  fromAddress,
}: EmailModalProps) {
  const [subject, setSubject] = useState('')
  const [richTextValue, setRichTextValue] = useState<PortableTextBlock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const { showNotification } = useNotification()
  const initializedRef = useRef(false)

  // Set initial values when modal opens - only once per modal session
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      setSubject(initialValues.subject || '')
      // Handle both string and PortableTextBlock[] initial values
      const initialMessage = initialValues.message
      if (Array.isArray(initialMessage)) {
        // It's already PortableTextBlock[]
        setRichTextValue(initialMessage)
      } else if (initialMessage) {
        // It's a string, convert to PortableTextBlock[]
        setRichTextValue(convertStringToPortableTextBlocks(initialMessage))
      } else {
        setRichTextValue([])
      }
      initializedRef.current = true
    } else if (!isOpen) {
      // Reset the initialized flag when modal closes
      initializedRef.current = false
    }
  }, [isOpen, initialValues.subject, initialValues.message])

  // Helper function to convert PortableText to plain text for fallback
  const convertPortableTextToString = (blocks: PortableTextBlock[]): string => {
    return blocks
      .map((block) => {
        if (block._type === 'block' && Array.isArray(block.children)) {
          return block.children
            .map((child: { _type: string; text?: string }) =>
              child._type === 'span' ? child.text || '' : '',
            )
            .join('')
        }
        return ''
      })
      .join('\n\n')
  }

  // Get both plain text and HTML versions of the message
  const getCurrentMessage = (): string => {
    return convertPortableTextToString(richTextValue)
  }

  const getCurrentMessageHTML = (): string => {
    // The PortableTextBlock from @portabletext/editor is compatible with @portabletext/types
    // but TypeScript needs help understanding this
    return portableTextToHTML(richTextValue as PortableTextBlockForHTML[])
  }

  const handleSend = async () => {
    const currentMessage = getCurrentMessage()

    if (!subject.trim() || !currentMessage.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing information',
        message: 'Please provide both subject and message for the email.',
      })
      return
    }

    setIsLoading(true)
    try {
      await onSend({
        subject,
        message: richTextValue,
      })

      // Reset form and close modal on success
      setSubject('')
      setRichTextValue([])
      initializedRef.current = false // Reset initialization flag
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
      setRichTextValue([])
      initializedRef.current = false // Reset initialization flag
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-slate-gray/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-4 pt-8">
        <DialogPanel className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-brand-frosted-steel p-6 pb-4">
            <div>
              <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray">
                {title}
              </DialogTitle>
              {contextInfo && (
                <p className="font-inter mt-1 text-sm text-brand-slate-gray/70">
                  {contextInfo}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-xl p-2 transition-colors duration-200 hover:bg-brand-sky-mist disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XMarkIcon className="h-5 w-5 text-brand-slate-gray" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {warningContent && (
              <div className="space-y-4 p-6 pb-0">{warningContent}</div>
            )}

            {/* Show either form or preview */}
            {showPreview && previewComponent ? (
              /* Preview Mode */
              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                    Email Preview
                  </h4>
                  <Button
                    variant="outline"
                    onClick={() => setShowPreview(false)}
                    size="sm"
                    className="font-space-grotesk rounded-xl"
                  >
                    <span className="hidden sm:inline">Back to Edit</span>
                    <span className="sm:hidden">Cancel</span>
                  </Button>
                </div>
                <div className="rounded-xl border border-brand-frosted-steel bg-white p-6">
                  {previewComponent({
                    subject,
                    message: richTextValue,
                    messageHTML: getCurrentMessageHTML(),
                  })}
                </div>
              </div>
            ) : (
              /* Email Composition Form */
              <div className="space-y-0">
                {/* Email Header Fields */}
                <div className="border-b border-brand-frosted-steel bg-brand-glacier-white">
                  {/* To Field */}
                  <div className="flex items-center border-b border-brand-frosted-steel/50 px-6 py-3">
                    <label className="font-space-grotesk w-16 text-sm font-medium text-brand-slate-gray">
                      To:
                    </label>
                    <div className="flex min-h-[32px] flex-1 items-center">
                      {typeof recipientInfo === 'string' ? (
                        <span className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray">
                          {recipientInfo}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {recipientInfo}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* From Field */}
                  <div className="flex items-center border-b border-brand-frosted-steel/50 px-6 py-3">
                    <label className="font-space-grotesk w-16 text-sm font-medium text-brand-slate-gray">
                      From:
                    </label>
                    <div className="flex-1">
                      <span className="font-inter text-sm text-brand-slate-gray">
                        {fromAddress}
                      </span>
                    </div>
                  </div>

                  {/* Subject Field */}
                  <div className="flex items-center px-6 py-3">
                    <label
                      htmlFor="subject"
                      className="font-space-grotesk w-16 text-sm font-medium text-brand-slate-gray"
                    >
                      Subject:
                    </label>
                    <div className="flex-1">
                      <input
                        id="subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm placeholder-brand-slate-gray/50 focus:ring-0 focus:outline-none"
                        placeholder={
                          placeholder.subject || 'Enter email subject...'
                        }
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>

                {/* Message Body */}
                <div className="p-6">
                  <PortableTextEditor
                    label=""
                    value={richTextValue}
                    onChange={setRichTextValue}
                    helpText={helpText}
                  />
                </div>
              </div>
            )}
          </div>{' '}
          <div className="flex flex-shrink-0 justify-between border-t border-brand-frosted-steel p-6">
            <div className="flex space-x-3">
              {previewComponent && (
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(!showPreview)}
                  disabled={
                    isLoading || !subject.trim() || !getCurrentMessage().trim()
                  }
                  className={`font-space-grotesk flex items-center gap-2 rounded-xl ${showPreview ? 'border-brand-cloud-blue bg-brand-sky-mist' : ''}`}
                >
                  <EyeIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Preview Email</span>
                  <span className="sm:hidden">Preview</span>
                </Button>
              )}
            </div>
            <div className="flex space-x-4">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="font-space-grotesk rounded-xl"
              >
                <span className="hidden sm:inline">Cancel</span>
                <span className="sm:hidden">Cancel</span>
              </Button>
              <Button
                onClick={handleSend}
                disabled={
                  isLoading || !subject.trim() || !getCurrentMessage().trim()
                }
                className="font-space-grotesk rounded-xl bg-brand-cloud-blue text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span className="hidden sm:inline">Sending...</span>
                    <span className="sm:hidden">...</span>
                  </div>
                ) : (
                  <>
                    <span className="hidden sm:inline">{submitButtonText}</span>
                    <span className="sm:hidden">Send</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
