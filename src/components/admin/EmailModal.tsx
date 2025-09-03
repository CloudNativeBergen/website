'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
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
  const { theme } = useTheme()
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
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={handleClose}
      >
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-25 fixed inset-0 bg-black" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 p-6 pb-4 dark:border-gray-700">
                  <div>
                    <DialogTitle className="font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
                      {title}
                    </DialogTitle>
                    {contextInfo && (
                      <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {contextInfo}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={isLoading}
                    className="rounded-xl p-2 transition-colors duration-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
                  >
                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
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
                        <h4 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                          Email Preview
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowPreview(false)}
                          className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800 dark:focus-visible:outline-gray-400"
                        >
                          <span className="hidden sm:inline">Back to Edit</span>
                          <span className="sm:hidden">Cancel</span>
                        </button>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
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
                      <div className="border-b border-gray-200 dark:border-gray-700">
                        {/* To Field */}
                        <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
                          <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
                            To:
                          </label>
                          <div className="flex min-h-[32px] flex-1 items-center">
                            {typeof recipientInfo === 'string' ? (
                              <span className="font-inter rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
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
                        <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
                          <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
                            From:
                          </label>
                          <div className="flex-1">
                            <span className="font-inter text-sm text-gray-600 dark:text-gray-300">
                              {fromAddress}
                            </span>
                          </div>
                        </div>

                        {/* Subject Field */}
                        <div className="flex items-center px-6 py-3">
                          <label
                            htmlFor="subject"
                            className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300"
                          >
                            Subject:
                          </label>
                          <div className="flex-1">
                            <input
                              id="subject"
                              type="text"
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm placeholder-gray-400 focus:ring-0 focus:outline-none dark:text-white dark:placeholder-gray-500"
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
                <div className="flex flex-shrink-0 justify-between border-t border-gray-200 p-6 dark:border-gray-700">
                  <div className="flex space-x-3">
                    {previewComponent && (
                      <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        disabled={
                          isLoading ||
                          !subject.trim() ||
                          !getCurrentMessage().trim()
                        }
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-50 dark:text-white dark:hover:bg-gray-800 dark:focus-visible:outline-gray-400 ${showPreview ? 'border border-indigo-500 bg-indigo-100 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border border-gray-300 dark:border-gray-600'}`}
                      >
                        <EyeIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Preview Email</span>
                        <span className="sm:hidden">Preview</span>
                      </button>
                    )}
                  </div>
                  <div className="flex space-x-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="text-sm/6 font-semibold whitespace-nowrap text-gray-900 disabled:opacity-50 dark:text-white"
                    >
                      <span className="hidden sm:inline">Cancel</span>
                      <span className="sm:hidden">Cancel</span>
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={
                        isLoading ||
                        !subject.trim() ||
                        !getCurrentMessage().trim()
                      }
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-pulse rounded bg-white/30" />
                          <span className="hidden sm:inline">Sending...</span>
                          <span className="sm:hidden">...</span>
                        </div>
                      ) : (
                        <>
                          <span className="hidden sm:inline">
                            {submitButtonText}
                          </span>
                          <span className="sm:hidden">Send</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
