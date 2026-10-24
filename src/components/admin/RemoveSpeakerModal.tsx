'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { UserMinusIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { ModalShell } from '@/components/ModalShell'
import { Textarea, HelpText } from '@/components/Form'
import { Status } from '@/lib/proposal/types'
import { api } from '@/lib/trpc/client'

/**
 * Take one speaker off a multi-speaker talk without canceling it. Styled like
 * ProposalActionModal's cancel confirmation.
 */
export function RemoveSpeakerModal({
  open,
  close,
  proposal,
  speaker,
  onRemoved,
}: {
  open: boolean
  close: () => void
  proposal: { _id: string; title: string; status: Status }
  speaker: { _id: string; name: string }
  onRemoved: () => void
}) {
  const [comment, setComment] = useState('')
  const [revokeTicket, setRevokeTicket] = useState(false)
  const [error, setError] = useState('')
  // Speaker tickets are only issued on confirm.
  const offersTicketCancel = proposal.status === Status.confirmed

  const mutation = api.proposal.admin.removeSpeaker.useMutation({
    onSuccess: () => {
      onRemoved()
      close()
    },
    onError: (e) => setError(e.message || 'Unknown error. Please try again.'),
  })

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      size="lg"
      padded={false}
      className="relative overflow-hidden px-6 py-5 sm:p-8"
    >
      <div className="absolute top-0 right-0 pt-2 pr-2">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-gray-900 dark:text-gray-500 dark:hover:text-gray-400"
          onClick={close}
        >
          <span className="sr-only">Close</span>
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10 dark:bg-red-900/30">
          <UserMinusIcon
            className="h-6 w-6 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        </div>
        <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
          <DialogTitle
            as="h3"
            className="text-base/7 leading-6 font-semibold text-gray-900 dark:text-white"
          >
            Remove speaker from talk
          </DialogTitle>
          {error && (
            <p className="mt-2 text-sm/6 text-red-500 dark:text-red-400">
              Server error: &quot;{error}&quot;
            </p>
          )}
          <p className="mt-2 text-sm/6 text-gray-600 dark:text-gray-400">
            Remove <span className="font-semibold">{speaker.name}</span> from{' '}
            <span className="font-semibold">{proposal.title}</span>? The talk
            keeps its other speakers.
          </p>
          <p className="mt-2 text-sm/6 text-gray-600 dark:text-gray-400">
            {speaker.name} gets an email and an in-app notice. The other
            speakers and organizers see a message on the talk.
          </p>
          {offersTicketCancel && (
            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={revokeTicket}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500 dark:focus:ring-indigo-500"
                  onChange={() => setRevokeTicket(!revokeTicket)}
                />
                <span className="ml-2 text-sm/6 text-gray-700 dark:text-gray-300">
                  Cancel the speaker&apos;s ticket
                </span>
              </label>
              <HelpText>
                Organizers get a Slack message to cancel the ticket by hand in
                the ticket provider. A speaker with another confirmed talk at
                this conference keeps their ticket.
              </HelpText>
            </div>
          )}
          <div className="mt-4">
            <Textarea
              name="remove-speaker-comment"
              label="Comment"
              rows={3}
              value={comment}
              setValue={setComment}
              placeholder="Add a comment..."
            />
            <HelpText>
              Included in the message on the talk and in the email to{' '}
              {speaker.name}.
            </HelpText>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={mutation.isPending}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm/6 font-semibold text-white shadow-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-3 sm:w-auto dark:bg-red-700 dark:hover:bg-red-600"
          onClick={() =>
            mutation.mutate({
              proposalId: proposal._id,
              speakerId: speaker._id,
              comment: comment.trim() || undefined,
              revokeTicket: offersTicketCancel && revokeTicket,
            })
          }
        >
          {mutation.isPending ? 'Removing...' : 'Remove speaker'}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md px-3 py-2 text-sm/6 font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto dark:text-white dark:ring-gray-600 dark:hover:bg-gray-800"
          onClick={close}
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  )
}
