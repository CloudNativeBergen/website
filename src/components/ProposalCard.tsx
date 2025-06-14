import { FormatStatus } from '@/lib/proposal/format'
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
import { sanityImage } from '@/lib/sanity/client'

interface ProposalButtonAction {
  label: Action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  link?: string
  onClick?: () => void
}

import clsx from 'clsx'

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function ProposalActionLink({ action }: { action: ProposalButtonAction }) {
  return (
    <a
      href={action.link}
      className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 border border-transparent py-4 text-sm font-semibold text-brand-slate-gray"
    >
      <action.icon
        className="h-5 w-5 text-brand-cloud-gray"
        aria-hidden="true"
      />
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
        proposal.status === Status.accepted
          ? 'border-2 border-brand-fresh-green/50'
          : '',
        'col-span-1 divide-y divide-brand-cloud-gray/20 rounded-lg bg-white shadow',
      )}
    >
      <div className="flex w-full items-center justify-between space-x-6 p-6">
        <div className="flex-1 truncate">
          <div className="flex items-center space-x-3">
            <h3 className="font-space-grotesk truncate text-sm font-medium text-brand-slate-gray">
              {proposal.title}
            </h3>
            <FormatStatus status={proposal.status} />
          </div>
          <p className="font-inter mt-1 truncate text-sm text-brand-cloud-gray">
            {proposal.status === Status.accepted ? (
              <>Your proposal has been accepted.</>
            ) : (
              <>{portableTextToString(proposal.description)}</>
            )}
          </p>
        </div>
        {proposal.speaker && 'image' in proposal.speaker ? (
          <img
            className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-300"
            src={
              proposal.speaker.image
                ? sanityImage(proposal.speaker.image)
                    .width(80)
                    .height(80)
                    .fit('crop')
                    .url()
                : 'https://placehold.co/80x80/e5e7eb/6b7280?text=Speaker'
            }
            alt="Speaker Image"
            width={40}
            height={40}
            loading="lazy"
          />
        ) : (
          <UserCircleIcon
            className="h-10 w-10 flex-shrink-0 rounded-full bg-brand-cloud-gray/20"
            aria-hidden="true"
          />
        )}
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
