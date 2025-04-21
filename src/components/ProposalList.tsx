'use client'

import { Action, ProposalExisting, Status } from "@/lib/proposal/types"
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/solid"
import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { ProposalActionModal } from "./ProposalActionModal"
import { ProposalCard } from "./ProposalCard"

function ProposalSuccessMessage() {
  const [showMessage, setShowMessage] = useState(true)

  const dismissMessage = () => {
    window.history.replaceState({}, document.title, window.location.pathname)
    setShowMessage(false)
  }

  return (
    <>
      {showMessage && (
        <div className="mx-auto mt-6 flex max-w-2xl flex-col rounded-md bg-green-50 p-4 lg:max-w-4xl lg:px-12">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircleIcon
                className="h-5 w-5 text-green-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Proposal submitted successfully.
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  type="button"
                  className="inline-flex rounded-md bg-green-50 p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
                  onClick={dismissMessage}
                >
                  <span className="sr-only">Dismiss</span>
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ProposalList({ initialProposals, cfpIsOpen }: { initialProposals: ProposalExisting[], cfpIsOpen: boolean }) {
  const searchParams = useSearchParams()
  const success = searchParams.get('success') ?? undefined
  const confirm = searchParams.get('confirm') ?? ''

  const [actionOpen, setActionOpen] = useState<boolean>(false)
  const [actionProposal, setActionProposal] = useState<ProposalExisting>(
    {} as ProposalExisting,
  )
  const [actionAction, setActionAction] = useState<Action>(Action.submit)

  const [proposals, setProposals] = useState<ProposalExisting[]>(initialProposals)

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
    setProposals(
      proposals.map((p) => {
        if (p._id === id) {
          p.status = status
        }
        return p
      }),
    )
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
      {success && <ProposalSuccessMessage />}
      {
        proposals.length === 0 ? (
          <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center rounded-lg border-2 border-dashed border-blue-600 bg-white p-6 lg:max-w-4xl lg:px-12">
            <p className="text-lg font-semibold text-gray-900">
              You have no proposals yet.
            </p>
            {cfpIsOpen && (
              <>
                <p className="mt-2 text-sm text-gray-500">
                  Submit a proposal to become a speaker.
                </p>
                <a
                  href="/cfp/submit"
                  className="mt-4 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Submit Proposal
                </a>
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
            />
            <ul
              role="list"
              className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:max-w-4xl"
            >
              {proposals.map((proposal) => (
                <ProposalCard
                  key={proposal._id}
                  proposal={proposal}
                  actionCallback={actionHandler}
                />
              ))}
            </ul>
          </>
        )
      }
    </>
  )
}