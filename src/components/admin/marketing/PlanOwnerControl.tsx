'use client'

import { UserCircleIcon } from '@heroicons/react/24/outline'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import type { PlanView } from '@/lib/marketing/types'

/**
 * Who owns the plan, and where it came from (spec §2.1, §3.1). Any organizer
 * may delegate it; the owner is the default assignee of the Tasks Triggers
 * and the recurring expansion create from now on.
 */
export function PlanOwnerControl({ view }: { view: PlanView }) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const setOwner = api.marketing.plan.setOwner.useMutation({
    onSuccess: () => {
      void utils.marketing.plan.get.invalidate()
      showNotification({ type: 'success', title: 'Plan owner changed' })
    },
    onError: (err) =>
      showNotification({
        type: 'error',
        title: 'Could not change the owner',
        message: err.message,
      }),
  })
  const { plan, organizers } = view
  const ownerKnown = organizers.some((o) => o._id === plan.ownerId)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
      <label htmlFor="plan-owner" className="flex items-center gap-2">
        <UserCircleIcon className="size-5 text-gray-400" />
        <span>Owner</span>
        <select
          id="plan-owner"
          // Follow the choice while it is in flight, so the select does not
          // snap back before the refetch confirms it — but only while it is:
          // a change that failed must show the owner the plan still has.
          value={
            (setOwner.isPending ? setOwner.variables?.ownerId : null) ??
            plan.ownerId ??
            ''
          }
          disabled={setOwner.isPending}
          onChange={(e) =>
            e.target.value &&
            e.target.value !== plan.ownerId &&
            setOwner.mutate({ ownerId: e.target.value })
          }
          className="rounded-md border border-gray-300 bg-white py-1 pr-8 pl-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          {!ownerKnown && (
            <option value={plan.ownerId ?? ''}>
              {plan.ownerName ??
                (plan.ownerId ? 'Former organizer' : 'No owner')}
            </option>
          )}
          {organizers.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        New sponsor and speaker tasks are assigned to the owner.
      </span>
      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
        {plan.copiedFromTitle
          ? `Copied from ${plan.copiedFromTitle}`
          : plan.templateVersion.startsWith('copy:')
            ? 'Copied from a previous edition'
            : `Template ${plan.templateVersion}`}
      </span>
    </div>
  )
}
