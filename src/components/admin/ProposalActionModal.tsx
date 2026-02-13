'use client'

import React, { useState, useMemo } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ModalShell } from '@/components/ModalShell'
import { Textarea, HelpText } from '@/components/Form'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'
import {
  ArchiveBoxXMarkIcon,
  EnvelopeIcon,
  HeartIcon,
  XMarkIcon,
  BellIcon,
} from '@heroicons/react/20/solid'
import { Speaker } from '@/lib/speaker/types'
import { TrashIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { api } from '@/lib/trpc/client'

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function colorForAction(action: Action): [string, string, string] {
  switch (action) {
    case Action.submit:
      return [
        'bg-blue-100 dark:bg-blue-900/30',
        'text-blue-600 dark:text-blue-400',
        'bg-blue-600 hover:bg-blue-500 dark:bg-blue-700 dark:hover:bg-blue-600',
      ]
    case Action.accept:
    case Action.confirm:
      return [
        'bg-green-100 dark:bg-green-900/30',
        'text-green-600 dark:text-green-400',
        'bg-green-600 hover:bg-green-500 dark:bg-green-700 dark:hover:bg-green-600',
      ]
    case Action.remind:
      return [
        'bg-yellow-100 dark:bg-yellow-900/30',
        'text-yellow-600 dark:text-yellow-400',
        'bg-yellow-600 hover:bg-yellow-500 dark:bg-yellow-700 dark:hover:bg-yellow-600',
      ]
    case Action.reject:
    case Action.withdraw:
    case Action.delete:
      return [
        'bg-red-100 dark:bg-red-900/30',
        'text-red-600 dark:text-red-400',
        'bg-red-600 hover:bg-red-500 dark:bg-red-700 dark:hover:bg-red-600',
      ]
  }

  return [
    'bg-gray-100 dark:bg-gray-800',
    'text-gray-600 dark:text-gray-400',
    'bg-gray-600 hover:bg-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600',
  ]
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
    case Action.remind:
      return BellIcon
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
  const [notify, setNotify] = useState<boolean>(true)
  const [comment, setComment] = useState<string>('')

  const actionIconType = useMemo(() => iconForAction(action), [action])
  const [iconBgColor, iconTextColor, buttonColor] = useMemo(
    () => colorForAction(action),
    [action],
  )

  const actionMutation = api.proposal.action.useMutation({
    onSuccess: (data) => {
      onAction(proposal._id, data.proposalStatus)
      close()
    },
    onError: (error) => {
      setError(error.message || 'Unknown error occurred. Please try again.')
    },
  })

  async function submitHandler() {
    actionMutation.mutate({
      id: proposal._id,
      action,
      notify,
      comment,
    })
  }

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      size="lg"
      padded={false}
      className="relative overflow-hidden px-6 py-5 sm:p-8"
    >
      <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
        <button
          type="button"
          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-gray-900 dark:text-gray-500 dark:hover:text-gray-400"
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
            'mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10',
          )}
        >
          {React.createElement(actionIconType, {
            className: clsx(iconTextColor, 'h-6 w-6'),
            'aria-hidden': 'true',
          })}
        </div>
        <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
          <DialogTitle
            as="h3"
            className="text-base/7 leading-6 font-semibold text-gray-900 dark:text-white"
          >
            {capitalizeFirstLetter(action)} proposal
          </DialogTitle>
          {error && (
            <div className="mt-2">
              <p className="text-sm/6 text-red-500 dark:text-red-400">
                Server error: &quot;{error}&quot;
              </p>
            </div>
          )}
          {(action === Action.accept ||
            action === Action.remind ||
            action === Action.reject) &&
            notify &&
            createLocalhostWarning(domain, 'speakers') && (
              <div className="mt-2">
                {createLocalhostWarning(domain, 'speakers')}
              </div>
            )}
          {adminUI ? (
            <div className="mt-2">
              <p className="text-sm/6 text-gray-600 dark:text-gray-400">
                Are you sure you want to {action} the proposal{' '}
                <span className="font-semibold">{proposal.title}</span> by{' '}
                <span className="font-semibold">
                  {proposal.speakers &&
                    Array.isArray(proposal.speakers) &&
                    proposal.speakers.length > 0
                    ? proposal.speakers
                      .map((speaker) =>
                        typeof speaker === 'object' && 'name' in speaker
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
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500 dark:focus:ring-indigo-500"
                    onChange={() => setNotify(!notify)}
                  />
                  <span className="ml-2 text-sm/6 text-gray-700 dark:text-gray-300">
                    Notify the speaker via email
                  </span>
                </label>
              </div>
              <div className="mt-4">
                <Textarea
                  name="action-comment"
                  label="Comment"
                  rows={3}
                  value={comment}
                  setValue={setComment}
                  placeholder="Add a comment..."
                />
                <HelpText>
                  Your comment will be included in the email to the speaker.
                </HelpText>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm/6 text-gray-600 dark:text-gray-400">
                Are you sure you want to {action} the proposal{' '}
                <span className="font-semibold">{proposal.title}</span>?
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={actionMutation.isPending}
          className={clsx(
            buttonColor,
            actionMutation.isPending ? 'cursor-not-allowed' : 'cursor-pointer',
            'inline-flex w-full justify-center rounded-md px-3 py-2 text-sm/6 font-semibold text-white shadow-sm sm:ml-3 sm:w-auto',
          )}
          onClick={() => submitHandler()}
        >
          {actionMutation.isPending
            ? `${capitalizeFirstLetter(action)}...`
            : capitalizeFirstLetter(action)}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md px-3 py-2 text-sm/6 font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto dark:text-white dark:ring-gray-600 dark:hover:bg-gray-800"
          onClick={() => close()}
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  )
}
