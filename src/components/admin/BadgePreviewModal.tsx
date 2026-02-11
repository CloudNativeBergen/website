'use client'

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import type { BadgeRecord } from '@/lib/badge/types'

interface BadgePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  badge: BadgeRecord
}

export function BadgePreviewModal({
  isOpen,
  onClose,
  badge,
}: BadgePreviewModalProps) {
  const { theme } = useTheme()

  let badgeData: Record<string, unknown> | null = null
  try {
    badgeData = JSON.parse(badge.badgeJson)
  } catch (error) {
    console.error('Failed to parse badge JSON:', error)
  }

  const speaker =
    typeof badge.speaker === 'object' && 'name' in badge.speaker
      ? badge.speaker
      : null
  const conference =
    typeof badge.conference === 'object' && 'title' in badge.conference
      ? badge.conference
      : null

  const imageUrl = badge.bakedSvg?.asset?.url

  return (
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={onClose}
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
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-6 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-6 flex items-start justify-between">
                  <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
                    Badge Details
                  </DialogTitle>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Badge Image */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Badge Preview
                    </h3>
                    {imageUrl ? (
                      <div className="flex justify-center rounded-xl border border-brand-frosted-steel bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <img
                          src={imageUrl}
                          alt={`${badge.badgeType} badge`}
                          className="h-auto w-full max-w-[300px]"
                        />
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center rounded-xl border border-brand-frosted-steel bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Badge image not available
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {imageUrl && (
                        <a
                          href={`/api/badge/${badge.badgeId}/download`}
                          download
                          className="bg-brand-aqua dark:hover:bg-brand-aqua flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue dark:bg-brand-cloud-blue"
                        >
                          Download Badge
                        </a>
                      )}
                      {badge.verificationUrl && (
                        <a
                          href={badge.verificationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-brand-mist flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-brand-slate-gray transition-colors hover:bg-brand-frosted-steel dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        >
                          Verify
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Badge Metadata */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Metadata
                    </h3>

                    <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                      {/* Speaker Info */}
                      {speaker && (
                        <div>
                          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                            Recipient
                          </dt>
                          <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                            {speaker.image && (
                              <img
                                src={`${speaker.image}?w=32&h=32&q=85&auto=format&fit=crop`}
                                alt={speaker.name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <div className="font-medium">{speaker.name}</div>
                              {speaker.email && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {speaker.email}
                                </div>
                              )}
                            </div>
                          </dd>
                        </div>
                      )}

                      {/* Conference Info */}
                      {conference && (
                        <div>
                          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                            Conference
                          </dt>
                          <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                            {conference.title}
                          </dd>
                        </div>
                      )}

                      {/* Badge Type */}
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Badge Type
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {badge.badgeType}
                          </span>
                        </dd>
                      </div>

                      {/* Issue Date */}
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Issued At
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                          {new Date(badge.issuedAt).toLocaleString('en-US', {
                            dateStyle: 'long',
                            timeStyle: 'short',
                          })}
                        </dd>
                      </div>

                      {/* Badge ID */}
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Badge ID
                        </dt>
                        <dd className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                          {badge.badgeId}
                        </dd>
                      </div>

                      {/* Email Status */}
                      <div>
                        <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Email Status
                        </dt>
                        <dd className="mt-1">
                          {badge.emailSent ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                                <CheckCircleIcon className="h-4 w-4" />
                                Sent successfully
                              </div>
                              {badge.emailSentAt && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(badge.emailSentAt).toLocaleString(
                                    'en-US',
                                    {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    },
                                  )}
                                </div>
                              )}
                              {badge.emailId && (
                                <div className="font-mono text-xs text-gray-400 dark:text-gray-500">
                                  ID: {badge.emailId}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                <ExclamationCircleIcon className="h-4 w-4" />
                                Not sent
                              </div>
                              {badge.emailError && (
                                <div className="mt-2 rounded-md bg-red-50 p-2 dark:bg-red-900/20">
                                  <p className="text-xs font-medium text-red-800 dark:text-red-200">
                                    Error:
                                  </p>
                                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                                    {badge.emailError}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </dd>
                      </div>
                    </div>

                    {/* OpenBadges Credential Details */}
                    {badgeData && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          OpenBadges 3.0 Credential
                        </h4>
                        <div className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                          <pre className="text-xs text-gray-700 dark:text-gray-300">
                            {JSON.stringify(badgeData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-brand-frosted-steel pt-4 dark:border-gray-700">
                  <button
                    onClick={onClose}
                    className="bg-brand-aqua dark:hover:bg-brand-aqua rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue dark:bg-brand-cloud-blue"
                  >
                    Close
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
