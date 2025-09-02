'use client'

import { Action, ProposalExisting, Status } from '@/lib/proposal/types'
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/solid'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { ProposalActionModal } from './ProposalActionModal'
import { ProposalCard } from './ProposalCard'
import Link from 'next/link'

function ProposalSuccessMessage({
  showMessage,
  onDismiss,
}: {
  showMessage: boolean
  onDismiss: () => void
}) {
  return showMessage ? (
    <div className="mx-auto mt-6 flex max-w-2xl flex-col rounded-md bg-green-50 p-4 lg:max-w-6xl lg:px-12 dark:bg-green-900/20">
      <div className="flex">
        <div className="flex-shrink-0">
          <CheckCircleIcon
            className="h-5 w-5 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Proposal submitted successfully.
          </p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              type="button"
              className="inline-flex rounded-md bg-green-50 p-1.5 text-green-600 transition-colors hover:bg-green-100 focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50 focus:outline-none dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 dark:focus:ring-green-400 dark:focus:ring-offset-green-900/20"
              onClick={onDismiss}
            >
              <span className="sr-only">Dismiss</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null
}

export function ProposalList({
  initialProposals,
  cfpIsOpen,
  currentConferenceId,
}: {
  initialProposals: ProposalExisting[]
  cfpIsOpen: boolean
  currentConferenceId: string
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const success = searchParams.get('success') ?? undefined
  const confirm = searchParams.get('confirm') ?? ''

  // Get current domain for warning purposes
  const currentDomain =
    typeof window !== 'undefined' ? window.location.hostname : ''

  const [showSuccessMessage, setShowSuccessMessage] =
    useState<boolean>(!!success)
  const [actionOpen, setActionOpen] = useState<boolean>(false)
  const [actionProposal, setActionProposal] = useState<ProposalExisting>(
    {} as ProposalExisting,
  )
  const [actionAction, setActionAction] = useState<Action>(Action.submit)

  const [proposals, setProposals] =
    useState<ProposalExisting[]>(initialProposals)

  const dismissSuccessMessage = () => {
    window.history.replaceState({}, document.title, window.location.pathname)
    setShowSuccessMessage(false)
  }

  function actionCloseHandler() {
    setActionOpen(false)
    // Wait for the modal to close before resetting the action and proposal.
    setTimeout(() => {
      setActionProposal({} as ProposalExisting)
      setActionAction(Action.submit)
    }, 400)
  }

  // actionUpdateHandler updates the status of a proposal in the list
  // of proposals without making a request to the server.
  function actionUpdateHandler(id: string, status: Status) {
    if (status === Status.deleted) {
      setProposals(proposals.filter((p) => p._id !== id))
    } else {
      setProposals(
        proposals.map((p) => {
          if (p._id === id) {
            p.status = status
          }
          return p
        }),
      )
    }
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  const actionHandler = useCallback(
    async (proposal: ProposalExisting, action: Action) => {
      // Handle navigation actions
      if (action === Action.view) {
        // Redirect to speaker-accessible view page
        router.push(`/cfp/proposal/${proposal._id}`)
        return
      }

      if (action === Action.edit) {
        // Use the submit page with id parameter
        router.push(`/cfp/submit?id=${proposal._id}`)
        return
      }

      // Handle modal actions
      setActionAction(action)
      setActionProposal(proposal)
      setActionOpen(true)
    },
    [router],
  )

  useEffect(() => {
    if (confirm) {
      const proposal = proposals.find((p) => p._id === confirm)
      if (proposal && proposal.status === Status.accepted) {
        actionHandler(proposal, Action.confirm)
      }
    }
  }, [confirm, proposals, actionHandler])

  return (
    <>
      <ProposalSuccessMessage
        showMessage={showSuccessMessage}
        onDismiss={dismissSuccessMessage}
      />
      {proposals.length === 0 ? (
        <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center rounded-lg border-2 border-dashed border-brand-cloud-blue bg-gray-50 p-6 lg:max-w-6xl lg:px-12 dark:border-blue-500 dark:bg-gray-800">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            You have no proposals yet.
          </p>
          {cfpIsOpen && (
            <>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Submit a proposal to become a speaker.
              </p>
              <Link
                href="/cfp/submit"
                className="mt-4 rounded-md bg-brand-cloud-blue px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Submit Proposal
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <ProposalActionModal
            open={actionOpen}
            action={actionAction}
            close={actionCloseHandler}
            proposal={actionProposal}
            onAction={actionUpdateHandler}
            domain={currentDomain}
          />
          <div className="mx-auto mt-6 max-w-2xl lg:max-w-6xl">
            {/* Group proposals by conference */}
            {Object.entries(
              proposals.reduce(
                (groups, proposal) => {
                  // Get conference name safely
                  const conferenceName =
                    typeof proposal.conference === 'object' &&
                    'title' in proposal.conference
                      ? proposal.conference.title
                      : 'Unknown Conference'

                  // Initialize array if it doesn't exist
                  if (!groups[conferenceName]) {
                    groups[conferenceName] = []
                  }

                  // Add proposal to appropriate group
                  groups[conferenceName].push(proposal)
                  return groups
                },
                {} as Record<string, ProposalExisting[]>,
              ),
            ).map(([conferenceName, conferenceProposals]) => (
              <div key={conferenceName} className="mb-8">
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {conferenceName}
                </h2>
                <ul
                  role="list"
                  className="grid grid-cols-1 gap-6 sm:grid-cols-2"
                >
                  {conferenceProposals.map((proposal) => {
                    // Check if this proposal belongs to a different conference
                    const isFromDifferentConference =
                      typeof proposal.conference === 'object' &&
                      proposal.conference !== null &&
                      '_id' in proposal.conference &&
                      proposal.conference._id !== currentConferenceId

                    // Check if CFP has ended for the current conference
                    const isCfpEnded = Boolean(
                      typeof proposal.conference === 'object' &&
                        proposal.conference !== null &&
                        'cfp_end_date' in proposal.conference &&
                        proposal.conference.cfp_end_date &&
                        new Date(proposal.conference.cfp_end_date as string) <
                          new Date(),
                    )

                    // Mark as read-only if from different conference OR CFP has ended
                    const readOnly = isFromDifferentConference || isCfpEnded

                    return (
                      <ProposalCard
                        key={proposal._id}
                        proposal={proposal}
                        actionCallback={actionHandler}
                        readOnly={readOnly}
                      />
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
