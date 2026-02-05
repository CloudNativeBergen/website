'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import { useNotification } from './NotificationProvider'
import {
  XMarkIcon,
  EyeIcon,
  ClockIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { useEmailModalStorage } from '@/hooks/useEmailModalStorage'

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
  storageKey?: string
  additionalFields?: Record<string, string | number | boolean>
  onAdditionalFieldsChange?: (
    fields: Record<string, string | number | boolean>,
  ) => void

  ticketUrl?: string
  onTicketUrlChange?: (url: string) => void
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
  storageKey,
  additionalFields = {},
  onAdditionalFieldsChange,
  ticketUrl,
  onTicketUrlChange,
}: EmailModalProps) {
  const { theme } = useTheme()
  const [subject, setSubject] = useState('')
  const [richTextValue, setRichTextValue] = useState<PortableTextBlock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false)
  const [editorRemountKey, setEditorRemountKey] = useState(0)
  const { showNotification } = useNotification()
  const initializedKeysRef = useRef<Set<string>>(new Set())
  const isInitializingRef = useRef(false)
  const lastAutoSaveRef = useRef<{ subject: string; message: string } | null>(
    null,
  )

  const storage = useEmailModalStorage({
    storageKey: storageKey || 'email-modal-default',
    isOpen,
  })

  useEffect(() => {
    const currentStorageKey = storageKey || 'email-modal-default'
    const isCurrentKeyInitialized =
      initializedKeysRef.current.has(currentStorageKey)

    if (isOpen && !isCurrentKeyInitialized) {
      if (storage.isLoading) {
        return
      }

      isInitializingRef.current = true

      if (storageKey && storage.hasStoredData && storage.storedData) {
        setSubject(storage.storedData.subject || '')

        const storedMessage = storage.storedData.message
        if (Array.isArray(storedMessage)) {
          setRichTextValue(storedMessage)
          setEditorRemountKey((prev) => prev + 1)
        } else if (typeof storedMessage === 'string' && storedMessage) {
          const convertedBlocks =
            convertStringToPortableTextBlocks(storedMessage)
          setRichTextValue(convertedBlocks)
          setEditorRemountKey((prev) => prev + 1)
        } else {
          setRichTextValue([])
        }

        if (storage.storedData.additionalFields && onAdditionalFieldsChange) {
          onAdditionalFieldsChange(storage.storedData.additionalFields)
        }

        initializedKeysRef.current.add(currentStorageKey)
      } else {
        setSubject(initialValues.subject || '')

        const initialMessage = initialValues.message
        if (Array.isArray(initialMessage)) {
          setRichTextValue(initialMessage)
          setEditorRemountKey((prev) => prev + 1)
        } else if (initialMessage) {
          const convertedBlocks =
            convertStringToPortableTextBlocks(initialMessage)
          setRichTextValue(convertedBlocks)
          setEditorRemountKey((prev) => prev + 1)
        } else {
          setRichTextValue([])
        }
        initializedKeysRef.current.add(currentStorageKey)
      }

      setTimeout(() => {
        isInitializingRef.current = false
        setAutoSaveEnabled(true)
      }, 500)
    }
  }, [
    isOpen,
    storage.isLoading,
    storage.hasStoredData,
    storage.storedData,
    storageKey,
    initialValues,
    onAdditionalFieldsChange,
  ])

  useEffect(() => {
    if (!isOpen) {
      setAutoSaveEnabled(false)
      isInitializingRef.current = false
    }
  }, [isOpen])

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

  const getCurrentMessage = useCallback((): string => {
    return convertPortableTextToString(richTextValue)
  }, [richTextValue])

  const getCurrentMessageHTML = (): string => {
    return portableTextToHTML(richTextValue as PortableTextBlockForHTML[])
  }

  useEffect(() => {
    if (!autoSaveEnabled || !storage || isInitializingRef.current) return

    const editorValue = richTextValue
    const messageText = getCurrentMessage()

    const hasContent = subject.trim() || messageText.trim()
    const hasAdditionalFields = Object.keys(additionalFields).length > 0

    if (!hasContent && !hasAdditionalFields) return

    const currentContent = {
      subject,
      message: messageText,
      additionalFields: JSON.stringify(additionalFields),
    }

    const lastSave = lastAutoSaveRef.current as {
      subject: string
      message: string
      additionalFields?: string
    } | null

    if (
      lastSave?.subject === currentContent.subject &&
      lastSave?.message === currentContent.message &&
      lastSave?.additionalFields === currentContent.additionalFields
    ) {
      return
    }

    const autoSaveTimeoutRef = setTimeout(() => {
      storage.autoSave(subject, editorValue, additionalFields)
      lastAutoSaveRef.current = currentContent
    }, 1000)

    return () => {
      clearTimeout(autoSaveTimeoutRef)
    }
  }, [
    subject,
    richTextValue,
    storageKey,
    autoSaveEnabled,
    storage,
    additionalFields,
    getCurrentMessage,
  ])

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

      const isSharedStorage = storageKey?.includes('shared')

      if (storageKey && !isSharedStorage) {
        storage.clearStorage()
        setAutoSaveEnabled(false)
        setSubject('')
        setRichTextValue([])
      }

      onClose()
    } catch (error) {
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
      onClose()
    }
  }

  const handleClearDraft = () => {
    if (storageKey) {
      setAutoSaveEnabled(false)
      isInitializingRef.current = true

      const currentStorageKey = storageKey
      initializedKeysRef.current.delete(currentStorageKey)

      storage.clearStorage()
      setSubject('')
      setRichTextValue([])
      showNotification({
        type: 'success',
        title: 'Draft cleared',
        message: 'Saved draft has been removed.',
      })
      setTimeout(() => {
        isInitializingRef.current = false
        setAutoSaveEnabled(true)
      }, 100)
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
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <DialogTitle className="font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
                        {title}
                      </DialogTitle>
                      {storageKey &&
                        (storage.hasStoredData ||
                          storage.isSaving ||
                          storage.lastSaved) && (
                          <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                            <ClockIcon className="h-3 w-3" />
                            <span>
                              {storage.isSaving
                                ? 'Saving draft...'
                                : storage.lastSaved
                                  ? 'Draft saved'
                                  : `Draft saved ${storage.getLastModifiedText()}`}
                            </span>
                            {storage.hasStoredData && !storage.isSaving && (
                              <button
                                onClick={handleClearDraft}
                                className="ml-1 cursor-pointer rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800/50"
                                title="Clear draft"
                              >
                                <TrashIcon className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                    </div>
                    {contextInfo && (
                      <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {contextInfo}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={isLoading}
                    className="cursor-pointer rounded-xl p-2 transition-colors duration-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
                  >
                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {warningContent && (
                    <div className="space-y-4 p-6 pb-0">{warningContent}</div>
                  )}

                  {showPreview && previewComponent ? (
                    <div className="space-y-4 p-6">
                      <div className="flex items-center justify-between">
                        <h4 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                          Email Preview
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowPreview(false)}
                          className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800 dark:focus-visible:outline-gray-400"
                        >
                          <span className="hidden sm:inline">Back to Edit</span>
                          <span className="sm:hidden">Cancel</span>
                        </button>
                      </div>
                      <div className="rounded-xl bg-white p-6 dark:bg-gray-800">
                        {previewComponent({
                          subject,
                          message: richTextValue,
                          messageHTML: getCurrentMessageHTML(),
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      <div className="border-b border-gray-200 dark:border-gray-700">
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

                        <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
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

                        {ticketUrl !== undefined && onTicketUrlChange && (
                          <div className="flex items-center px-6 py-3">
                            <label
                              htmlFor="ticketUrl"
                              className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300"
                            >
                              Tickets:
                            </label>
                            <div className="flex-1">
                              <input
                                id="ticketUrl"
                                type="url"
                                value={ticketUrl}
                                onChange={(e) =>
                                  onTicketUrlChange(e.target.value)
                                }
                                className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm placeholder-gray-400 focus:ring-0 focus:outline-none dark:text-white dark:placeholder-gray-500"
                                placeholder="https://tickets.example.com"
                                disabled={isLoading}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-6">
                        <div className="mb-2">
                          <label className="font-space-grotesk text-sm font-medium text-gray-700 dark:text-gray-300">
                            Message
                          </label>
                        </div>
                        <div className="min-h-[200px] rounded-lg">
                          <PortableTextEditor
                            label=""
                            value={richTextValue}
                            onChange={setRichTextValue}
                            helpText={helpText}
                            forceRemountKey={editorRemountKey}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 justify-between border-t border-gray-200 p-6 dark:border-gray-700">
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
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-50 dark:text-white dark:hover:bg-gray-800 dark:focus-visible:outline-gray-400 ${showPreview ? 'border border-indigo-500 bg-indigo-100 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border border-gray-300 dark:border-gray-600'}`}
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
                      className="cursor-pointer text-sm/6 font-semibold whitespace-nowrap text-gray-900 disabled:opacity-50 dark:text-white"
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
                      className="inline-flex cursor-pointer items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
                    >
                      {' '}
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
