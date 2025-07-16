'use client'

import { Action, ProposalExisting, Status } from '@/lib/proposal/types'
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/solid'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
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
    <div className="mx-auto mt-6 flex max-w-2xl flex-col rounded-md bg-brand-fresh-green/10 p-4 lg:max-w-4xl lg:px-12">
      <div className="flex">
        <div className="flex-shrink-0">
          <CheckCircleIcon
            className="h-5 w-5 text-brand-fresh-green"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          <p className="font-inter text-sm font-medium text-brand-slate-gray">
            Proposal submitted successfully.
          </p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              type="button"
              className="inline-flex rounded-md bg-brand-fresh-green/10 p-1.5 text-brand-fresh-green transition-colors hover:bg-brand-fresh-green/20 focus:ring-2 focus:ring-brand-fresh-green focus:ring-offset-2 focus:ring-offset-brand-fresh-green/10 focus:outline-none"
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
}: {
  initialProposals: ProposalExisting[]
  cfpIsOpen: boolean
}) {
  const searchParams = useSearchParams()
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

  async function actionHandler(proposal: ProposalExisting, action: Action) {
    setActionAction(action)
    setActionProposal(proposal)
    setActionOpen(true)
  }

  useEffect(() => {
    if (confirm) {
      const proposal = proposals.find((p) => p._id === confirm)
      if (proposal && proposal.status === Status.accepted) {
        actionHandler(proposal, Action.confirm)
      }
    }
  }, [confirm, proposals])

  return (
    <>
      <ProposalSuccessMessage
        showMessage={showSuccessMessage}
        onDismiss={dismissSuccessMessage}
      />
      {proposals.length === 0 ? (
        <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center rounded-lg border-2 border-dashed border-brand-cloud-blue bg-white p-6 lg:max-w-4xl lg:px-12">
          <p className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
            You have no proposals yet.
          </p>
          {cfpIsOpen && (
            <>
              <p className="font-inter mt-2 text-sm text-gray-600">
                Submit a proposal to become a speaker.
              </p>
              <Link
                href="/cfp/submit"
                className="font-inter mt-4 rounded-md bg-brand-cloud-blue px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90"
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
          <div className="mx-auto mt-6 max-w-2xl lg:max-w-4xl">
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
                <h2 className="font-space-grotesk mb-4 text-2xl font-bold tracking-tight text-brand-slate-gray">
                  {conferenceName}
                </h2>
                <ul
                  role="list"
                  className="grid grid-cols-1 gap-6 sm:grid-cols-2"
                >
                  {conferenceProposals.map((proposal) => {
                    const isConferenceEnded = Boolean(
                      typeof proposal.conference === 'object' &&
                        proposal.conference !== null &&
                        'end_date' in proposal.conference &&
                        proposal.conference.end_date &&
                        new Date(proposal.conference.end_date as string) <
                          new Date(),
                    )

                    return (
                      <ProposalCard
                        key={proposal._id}
                        proposal={proposal}
                        actionCallback={actionHandler}
                        readOnly={isConferenceEnded}
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
