'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'
import {
  ArchiveBoxXMarkIcon,
  EnvelopeIcon,
  HeartIcon,
  XMarkIcon,
  BellIcon,
} from '@heroicons/react/20/solid'
import { Speaker } from '@/lib/speaker/types'
import { postProposalAction } from '@/lib/proposal/client'
import { TrashIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function colorForAction(action: Action): [string, string, string] {
  switch (action) {
    case Action.submit:
      return ['bg-blue-100', 'text-blue-600', 'bg-blue-600 hover:bg-blue-500']
    case Action.accept:
    case Action.confirm:
      return [
        'bg-green-100',
        'text-green-600',
        'bg-green-600 hover:bg-green-500',
      ]
    case Action.reject:
    case Action.withdraw:
    case Action.delete:
      return ['bg-red-100', 'text-red-600', 'bg-red-600 hover:bg-red-500']
  }

  return ['bg-gray-100', 'text-gray-600', 'bg-gray-600 hover:bg-gray-500']
}

function iconForAction(
  action: Action,
): React.FunctionComponent<React.SVGProps<SVGSVGElement>> {
  switch (action) {
    case Action.submit:
      return EnvelopeIcon
    case Action.accept:
    case Action.confirm:
      return HeartIcon
    case Action.reject:
      return ArchiveBoxXMarkIcon
    case Action.withdraw:
      return XMarkIcon
    case Action.delete:
      return TrashIcon
  }

  return XMarkIcon
}

export function ProposalActionModal({
  open,
  close,
  proposal,
  action,
  adminUI,
  onAction,
  domain,
}: {
  open: boolean
  close: () => void
  proposal: ProposalExisting
  action: Action
  adminUI?: boolean
  onAction: (id: string, status: Status) => void
  domain?: string
}) {
  const [error, setError] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [notify, setNotify] = useState<boolean>(true)
  const [comment, setComment] = useState<string>('')

  const ActionIcon = iconForAction(action)
  const [iconBgColor, iconTextColor, buttonColor] = colorForAction(action)

  async function submitHandler() {
    setIsSubmitting(true)
    const res = await postProposalAction(proposal._id, action, notify, comment)

    if (res.error) {
      setError(res.error.message)
    } else if (!res.proposalStatus) {
      setError('Unknown error occurred. Please try again.')
    } else {
      onAction(proposal._id, res.proposalStatus)
      close()
    }

    setIsSubmitting(false)
  }

  return (
    <Transition show={open}>
      <Dialog className="relative z-10" onClose={close}>
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-6 py-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-8">
                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
                    onClick={() => close()}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div
                    className={clsx(
                      iconBgColor,
                      'mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10',
                    )}
                  >
                    <ActionIcon
                      className={clsx(iconTextColor, 'h-6 w-6')}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <DialogTitle
                      as="h3"
                      className="text-base/7 leading-6 font-semibold text-gray-900"
                    >
                      {capitalizeFirstLetter(action)} proposal
                    </DialogTitle>
                    {error && (
                      <div className="mt-2">
                        <p className="text-sm/6 text-red-500">
                          Server error: &quot;{error}&quot;
                        </p>
                      </div>
                    )}
                    {domain &&
                      domain.includes('localhost') &&
                      (action === Action.accept || action === Action.reject) &&
                      notify && (
                        <div className="mt-2 rounded-md bg-yellow-50 p-4">
                          <div className="flex">
                            <div className="flex-shrink-0">
                              <BellIcon
                                className="h-5 w-5 text-yellow-400"
                                aria-hidden="true"
                              />
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-yellow-800">
                                Development Environment Warning
                              </h3>
                              <div className="mt-2 text-sm text-yellow-700">
                                <p>
                                  You are running on localhost. Email
                                  notifications will contain invalid links
                                  pointing to localhost URLs that speakers
                                  cannot access.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    {adminUI ? (
                      <div className="mt-2">
                        <p className="text-sm/6 text-gray-600">
                          Are you sure you want to {action} the proposal{' '}
                          <span className="font-semibold">
                            {proposal.title}
                          </span>{' '}
                          by{' '}
                          <span className="font-semibold">
                            {proposal.speakers &&
                            Array.isArray(proposal.speakers) &&
                            proposal.speakers.length > 0
                              ? proposal.speakers
                                  .map((speaker) =>
                                    typeof speaker === 'object' &&
                                    'name' in speaker
                                      ? (speaker as Speaker).name
                                      : 'Unknown',
                                  )
                                  .join(', ')
                              : 'Unknown author'}
                          </span>
                          ?
                        </p>
                        <div className="mt-4">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={notify}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                              onChange={() => setNotify(!notify)}
                            />
                            <span className="ml-2 text-sm/6 text-gray-700">
                              Notify the speaker via email
                            </span>
                          </label>
                        </div>
                        <div className="mt-4">
                          <label className="block text-sm/6 font-medium text-gray-900">
                            Comment
                          </label>
                          <textarea
                            className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                            rows={3}
                            placeholder="Add a comment..."
                            onChange={(e) => setComment(e.target.value)}
                          ></textarea>
                          <p className="mt-2 text-sm/6 text-gray-600">
                            Your comment will be included in the email to the
                            speaker.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-sm/6 text-gray-600">
                          Are you sure you want to {action} the proposal{' '}
                          <span className="font-semibold">
                            {proposal.title}
                          </span>
                          ?
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className={clsx(
                      buttonColor,
                      isSubmitting ? 'cursor-not-allowed' : 'cursor-pointer',
                      'inline-flex w-full justify-center rounded-md px-3 py-2 text-sm/6 font-semibold text-white shadow-sm sm:ml-3 sm:w-auto',
                    )}
                    onClick={() => submitHandler()}
                  >
                    {isSubmitting
                      ? `${capitalizeFirstLetter(action)}...`
                      : capitalizeFirstLetter(action)}
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm/6 font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => close()}
                  >
                    Cancel
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
