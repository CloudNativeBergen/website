import { Action, ProposalExisting, Status } from '@/lib/proposal/types'
import {
  BookOpenIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  PencilIcon,
  TrashIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'
import { SpinnerIcon } from './SocialIcons'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextTextBlock, PortableTextObject } from 'sanity'
import { SpeakerAvatars } from './SpeakerAvatars'

interface ProposalButtonAction {
  label: Action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  link?: string
  onClick?: () => void
}

import clsx from 'clsx'
import Link from 'next/link'

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function StatusBadge({ status }: { status: string }) {
  let text: string
  let colorClasses: string

  switch (status) {
    case Status.draft:
      text = 'Draft'
      colorClasses = 'bg-yellow-100 text-yellow-800'
      break
    case Status.submitted:
      text = 'Submitted'
      colorClasses = 'bg-blue-100 text-blue-800'
      break
    case Status.accepted:
      text = 'Accepted'
      colorClasses = 'bg-green-100 text-green-800'
      break
    case Status.rejected:
      text = 'Rejected'
      colorClasses = 'bg-red-100 text-red-800'
      break
    case Status.confirmed:
      text = 'Confirmed'
      colorClasses = 'bg-green-100 text-green-800'
      break
    case Status.withdrawn:
      text = 'Withdrawn'
      colorClasses = 'bg-gray-100 text-gray-800'
      break
    default:
      text = 'Unknown'
      colorClasses = 'bg-gray-100 text-gray-800'
      break
  }

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      {text}
    </span>
  )
}

function ProposalActionLink({ action }: { action: ProposalButtonAction }) {
  return (
    <Link
      href={action.link || '#'}
      className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 border border-transparent py-4 text-sm font-semibold text-brand-slate-gray"
    >
      <action.icon
        className="h-5 w-5 text-brand-cloud-gray"
        aria-hidden="true"
      />
      {capitalizeFirstLetter(action.label)}
    </Link>
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
      className="relative inline-flex w-0 flex-1 cursor-pointer items-center justify-center gap-x-3 border border-transparent py-4 text-sm font-semibold text-brand-slate-gray"
    >
      {isLoading ? (
        <SpinnerIcon className="h-5 w-5 animate-spin text-brand-cloud-gray" />
      ) : (
        <action.icon
          className="h-5 w-5 text-brand-cloud-gray"
          aria-hidden="true"
        />
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
      label: Action.delete,
      icon: TrashIcon,
      onClick: () => {
        actionCallback(proposal, Action.delete)
      },
    })
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
      className={clsx(
        'col-span-1 divide-y divide-brand-cloud-gray/20 rounded-lg bg-white shadow',
        // Status-based styling
        {
          'border-l-4 border-l-green-500': proposal.status === Status.accepted,
          'border-l-4 border-l-blue-500': proposal.status === Status.submitted,
          'border-l-4 border-l-yellow-500': proposal.status === Status.draft,
          'border-l-4 border-l-green-600': proposal.status === Status.confirmed,
          'border-l-4 border-l-red-500': proposal.status === Status.rejected,
          'border-l-4 border-l-gray-500': proposal.status === Status.withdrawn,
        },
      )}
    >
      <div className="p-6">
        <div className="mb-3 flex w-full items-start justify-between space-x-6">
          <div className="flex-1">
            <div className="mb-2">
              <StatusBadge status={proposal.status} />
            </div>
            <h3 className="font-space-grotesk truncate text-sm font-medium text-brand-slate-gray">
              {proposal.title}
            </h3>
          </div>
          {proposal.speakers &&
          Array.isArray(proposal.speakers) &&
          proposal.speakers.length > 0 ? (
            <SpeakerAvatars
              speakers={proposal.speakers}
              size="md"
              maxVisible={3}
            />
          ) : (
            <UserCircleIcon
              className="h-10 w-10 flex-shrink-0 rounded-full bg-brand-cloud-gray/20"
              aria-hidden="true"
            />
          )}
        </div>
        <p className="font-inter text-sm text-brand-cloud-gray">
          {proposal.status === Status.accepted ? (
            <>Your proposal has been accepted.</>
          ) : (
            <>{portableTextToString(proposal.description)}</>
          )}
        </p>
      </div>
      {!readOnly && actions.length > 0 && (
        <div>
          <div className="-mt-px flex divide-x divide-brand-cloud-gray/20">
            {actions.map((action, i) => (
              <div
                key={`${proposal._id}-${action.label}`}
                className={clsx(
                  i > 0 ? '-ml-px' : '',
                  'relative inline-flex w-0 flex-1',
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

function portableTextToString(value: PortableTextBlock[]): string {
  return value
    .map((block) =>
      (block as PortableTextTextBlock<PortableTextObject>).children
        .map((child) => child.text)
        .join(''),
    )
    .join(' ')
}
