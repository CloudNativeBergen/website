'use client'

import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { formatDateSafe } from '@/lib/time'
import { isFollowUpOverdue } from '@/lib/sponsor-crm/follow-up'
import { generateActionItems } from '@/lib/sponsor-crm/action-items'
import { sponsorPhase, sponsorTimeline } from '@/lib/sponsor-crm/phase'
import {
  getPrimaryAction,
  type SponsorSubView,
} from '@/components/admin/sponsor-crm/form/deal-status'
import type {
  SponsorActivityExpanded,
  SponsorForConferenceExpanded,
} from '@/lib/sponsor-crm/types'

interface SponsorPhaseWidgetProps {
  sponsor: SponsorForConferenceExpanded
  activities?: SponsorActivityExpanded[]
  /** Opens the full record on a tab; `pipeline` holds the owner field. */
  onOpenRecord: (view: SponsorSubView | 'pipeline') => void
  /** The page's refresh(), run after a status change. */
  onChanged: () => void
}

const buttonClass =
  'rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50'

export function SponsorPhaseWidget({
  sponsor,
  activities,
  onOpenRecord,
  onChanged,
}: SponsorPhaseWidgetProps) {
  const { showNotification } = useNotification()
  const onError = (error: { message: string }) =>
    showNotification({
      type: 'error',
      title: 'Could not change the status',
      message: error.message,
    })
  const moveStage = api.sponsor.crm.moveStage.useMutation({
    onSuccess: onChanged,
    onError,
  })
  const update = api.sponsor.crm.update.useMutation({
    onSuccess: onChanged,
    onError,
  })
  const pending = moveStage.isPending || update.isPending

  const phase = sponsorPhase(sponsor)
  const steps = sponsorTimeline(sponsor, activities)
  const action = getPrimaryAction(
    {
      tierId: sponsor.tier?._id ?? '',
      contractValue: sponsor.contractValue?.toString() ?? '',
      contractCurrency: sponsor.contractCurrency ?? 'NOK',
      status: sponsor.status,
      contractStatus: sponsor.contractStatus,
      invoiceStatus: sponsor.invoiceStatus,
    },
    sponsor,
  )
  const topItem = generateActionItems([sponsor])[0]
  // Action items carry no dates of their own; the only dated one (Follow-up
  // Due) comes from nextFollowUpAt, so the follow-up date is the due date.
  const due = sponsor.nextFollowUpAt
  const blocked = action && 'blockedReason' in action && action.blockedReason

  const runAction = () => {
    if (!action) return
    if (action.kind === 'view') onOpenRecord(action.target)
    else if (action.kind === 'status')
      moveStage.mutate({ id: sponsor._id, newStatus: action.target })
    else update.mutate({ id: sponsor._id, invoiceStatus: action.target })
  }

  return (
    <section
      aria-labelledby="sponsor-phase-heading"
      className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-6 py-4">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Phase
          </p>
          <h2
            id="sponsor-phase-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {phase}
          </h2>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Owner
          </p>
          {sponsor.assignedTo ? (
            <p className="text-sm text-gray-900 dark:text-white">
              {sponsor.assignedTo.name}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onOpenRecord('pipeline')}
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Assign an owner
            </button>
          )}
        </div>

        <div className="min-w-48 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Next action
          </p>
          {action ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runAction}
                disabled={pending || Boolean(blocked)}
                title={blocked || undefined}
                className={buttonClass}
              >
                {action.label}
              </button>
              {topItem && (
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {topItem.title}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {topItem?.title ?? 'Nothing to do'}
            </p>
          )}
          {blocked && (
            <p className="mt-1 text-xs whitespace-pre-line text-amber-700 dark:text-amber-400">
              {blocked}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Due
          </p>
          {due ? (
            <a
              href="#follow-up"
              className={
                isFollowUpOverdue(due)
                  ? 'text-sm font-medium text-red-600 hover:underline dark:text-red-400'
                  : 'text-sm text-gray-900 hover:underline dark:text-white'
              }
            >
              <time dateTime={due}>{formatDateSafe(due)}</time>
            </a>
          ) : (
            <a
              href="#follow-up"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              Set a follow-up date
            </a>
          )}
        </div>
      </div>

      <ol
        aria-label="Deal timeline"
        className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-200 px-6 py-3 text-sm dark:border-gray-700"
      >
        {steps.map((step) => {
          const Icon = step.key === 'lost' ? XCircleIcon : CheckCircleIcon
          return (
            <li
              key={step.key}
              className={
                step.reached
                  ? 'flex items-center gap-1.5 text-gray-900 dark:text-white'
                  : 'flex items-center gap-1.5 text-gray-400 dark:text-gray-500'
              }
            >
              {step.reached ? (
                <Icon
                  aria-hidden="true"
                  className={
                    step.key === 'lost'
                      ? 'h-4 w-4 text-red-500'
                      : 'h-4 w-4 text-green-600'
                  }
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-full border border-current"
                />
              )}
              <span>{step.label}</span>
              {step.date ? (
                <time dateTime={step.date} className="text-gray-500">
                  {formatDateSafe(step.date)}
                </time>
              ) : (
                <span className="text-gray-500">
                  {step.reached ? 'date unknown' : 'pending'}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
