import { FormatStatus } from "@/lib/proposal/format"
import { ProposalExisting, Status, Action } from "@/lib/proposal/types"
import Image from 'next/image'
import { PencilIcon, BookOpenIcon, EnvelopeIcon, XMarkIcon, CheckCircleIcon, UserCircleIcon } from "@heroicons/react/24/solid"
import { SpinnerIcon } from "./SocialIcons"

interface ProposalButtonAction {
  label: Action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  link?: string
  onClick?: () => void
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function ProposalActionLink({ action }: { action: ProposalButtonAction }) {
  return (
    <a
      href={action.link}
      className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 border border-transparent py-4 text-sm font-semibold text-gray-900"
    >
      <action.icon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      {capitalizeFirstLetter(action.label)}
    </a>
  )
}

function ProposalActionButton({
  action,
  isLoading,
}: {
  action: ProposalButtonAction
  isLoading: boolean
}) {
  return (
    <button
      disabled={isLoading}
      onClick={action.onClick}
      className="relative inline-flex w-0 flex-1 cursor-pointer items-center justify-center gap-x-3 border border-transparent py-4 text-sm font-semibold text-gray-900"
    >
      {isLoading ? (
        <SpinnerIcon className="text-grey-400 h-5 w-5 animate-spin" />
      ) : (
        <action.icon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      )}
      {capitalizeFirstLetter(action.label)}
    </button>
  )
}
export function ProposalCard({
  proposal,
  readOnly = false,
  actionCallback,
}: {
  proposal: ProposalExisting
  readOnly?: boolean
  actionCallback: (proposal: ProposalExisting, action: Action) => void

}) {
  const actions: ProposalButtonAction[] = []

  if (
    proposal.status === Status.draft ||
    proposal.status === Status.submitted
  ) {
    actions.push({
      label: Action.edit,
      icon: PencilIcon,
      link: `/cfp/submit?id=${proposal._id}`,
    })
  } else {
    actions.push({
      label: Action.view,
      icon: BookOpenIcon,
      link: `/cfp/submit?id=${proposal._id}`,
    })
  }

  if (proposal.status === Status.draft) {
    actions.push({
      label: Action.submit,
      icon: EnvelopeIcon,
      onClick: async () => {
        actionCallback(proposal, Action.submit)
      },
    })
  }

  if (proposal.status === Status.submitted) {
    actions.push({
      label: Action.unsubmit,
      icon: XMarkIcon,
      onClick: () => {
        actionCallback(proposal, Action.unsubmit)
      },
    })
  }

  if (
    proposal.status === Status.confirmed ||
    proposal.status === Status.accepted
  ) {
    actions.push({
      label: Action.withdraw,
      icon: XMarkIcon,
      onClick: () => {
        actionCallback(proposal, Action.withdraw)
      },
    })
  }

  if (proposal.status === Status.accepted) {
    actions.push({
      label: Action.confirm,
      icon: CheckCircleIcon,
      onClick: () => {
        actionCallback(proposal, Action.confirm)
      },
    })
  }

  return (
    <li
      key={proposal._id}
      className={classNames(
        proposal.status === Status.accepted
          ? 'border-2 border-green-500/50'
          : '',
        'col-span-1 divide-y divide-gray-200 rounded-lg bg-white shadow',
      )}
    >
      <div className="flex w-full items-center justify-between space-x-6 p-6">
        <div className="flex-1 truncate">
          <div className="flex items-center space-x-3">
            <h3 className="truncate text-sm font-medium text-gray-900">
              {proposal.title}
            </h3>
            <FormatStatus status={proposal.status} />
          </div>
          <p className="mt-1 truncate text-sm text-gray-500">
            {proposal.status === Status.accepted ? (
              <>Your proposal has been accepted.</>
            ) : (
              <>{proposal.description}</>
            )}
          </p>
        </div>
        {proposal.speaker && 'image' in proposal.speaker ? (
          <Image
            className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-300"
            src={proposal.speaker.image || '/images/default-avatar.png'}
            alt="Speaker Image"
            width={40}
            height={40}
          />
        ) : (
          <UserCircleIcon
            className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-300"
            aria-hidden="true"
          />
        )}
      </div>
      {!readOnly && actions.length > 0 && (
        <div>
          <div className="-mt-px flex divide-x divide-gray-200">
            {actions.map((action, i) => (
              <div
                key={`${proposal._id}-${action.label}`}
                className={classNames(
                  i > 0 ? '-ml-px' : '',
                  'relative flex inline-flex w-0 flex-1',
                )}
              >
                {action.link ? (
                  <ProposalActionLink action={action} />
                ) : (
                  <ProposalActionButton action={action} isLoading={false} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}