'use client'

import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { PlanRequired } from '@/lib/trpc/errors'

const KONTROLL = 'https://my.konf.app'
const LABEL = { basic: 'Basic', pro: 'Pro' } as const

/** Kontroll's billing page for the org, or Kontroll itself when unknown. */
function billingUrl(orgId?: string): string {
  return orgId
    ? `${KONTROLL}/orgs/${encodeURIComponent(orgId)}/billing`
    : KONTROLL
}

/** The upgrade prompt for a PLAN_REQUIRED refusal (#2129). */
export function PlanRequiredNotice({
  requiredPlan,
  orgId,
  isOwner,
  onDismiss,
}: PlanRequired & { onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-xs dark:border-amber-500/40 dark:bg-amber-950/60"
    >
      <SparklesIcon className="size-6 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 dark:text-white">
          This needs the {LABEL[requiredPlan]} plan
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          {isOwner
            ? 'Upgrade your organization to continue. You come back here after paying.'
            : 'Only an owner of your organization can change the plan.'}
        </p>
        <a
          href={billingUrl(orgId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
        >
          {isOwner ? 'Upgrade' : 'Ask an owner to upgrade'}
        </a>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <XMarkIcon className="size-5" />
        </button>
      )}
    </div>
  )
}
