'use client'

import {
  ExclamationTriangleIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type { SponsorHealthViolation } from '@/lib/sponsor-crm/health'
import type { TransitionAxis } from '@/lib/sponsor-crm/state-machine'
import { STATUSES, CONTRACT_STATUSES, INVOICE_STATUSES } from './form/constants'

const AXIS_LABELS: Record<TransitionAxis, string> = {
  pipeline: 'Pipeline',
  contract: 'Contract',
  signature: 'Signature',
  invoice: 'Invoice',
}

const SIGNATURE_STATE_LABELS: Record<string, string> = {
  'not-started': 'Not started',
  pending: 'Pending',
  signed: 'Signed',
  rejected: 'Rejected',
  expired: 'Expired',
}

/** Human-readable "Pipeline · Closed - Won" for the axis a violation breaks. */
function axisStateLabel(axis: TransitionAxis, state: string): string {
  let stateLabel = state
  if (axis === 'pipeline') {
    const s = STATUSES.find((x) => x.value === state)
    stateLabel = s?.columnLabel ?? s?.label ?? state
  } else if (axis === 'contract') {
    const s = CONTRACT_STATUSES.find((x) => x.value === state)
    stateLabel = s?.columnLabel ?? s?.label ?? state
  } else if (axis === 'signature') {
    stateLabel = SIGNATURE_STATE_LABELS[state] ?? state
  } else if (axis === 'invoice') {
    const s = INVOICE_STATUSES.find((x) => x.value === state)
    stateLabel = s?.label ?? state
  }
  return `${AXIS_LABELS[axis]} · ${stateLabel}`
}

function ViolationRow({ violation }: { violation: SponsorHealthViolation }) {
  const { hidesFromPublicSite } = violation
  return (
    <li
      className={clsx(
        'rounded-lg border p-3',
        hidesFromPublicSite
          ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {violation.sponsorName}
        </span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-300 ring-inset dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
          {axisStateLabel(violation.axis, violation.state)}
        </span>
        {hidesFromPublicSite && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-rose-500">
            <EyeSlashIcon className="h-3.5 w-3.5" />
            Hidden from the public site
          </span>
        )}
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {violation.missing.map((m) => (
          <li
            key={m.field}
            className="text-xs text-gray-600 dark:text-gray-400"
          >
            &bull; {m.message ?? m.label}
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * Data-health surface: lists every sponsor currently breaking a state-machine
 * invariant, each with the specific rule(s) it breaks. Closed-won-without-tier
 * violations — which hide a paying sponsor from the public site — are surfaced
 * first and styled most prominently. Renders nothing when all sponsors are
 * healthy. The rule logic lives in {@link auditSponsorHealth}, not here.
 */
export function SponsorHealthPanel({
  violations,
  isError = false,
}: {
  violations: SponsorHealthViolation[]
  /** The audit query failed — surface it rather than masquerading as healthy. */
  isError?: boolean
}) {
  // Nothing to show only when the audit ran cleanly and found no problems. An
  // errored audit must stay visible so an empty panel never reads as "healthy".
  if (!isError && violations.length === 0) return null

  return (
    <section
      aria-label="Sponsor data health"
      className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-900/40 dark:bg-gray-900"
    >
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Data health
        </h2>
        {violations.length > 0 && (
          <span
            aria-label={`${violations.length} data-health issues`}
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            {violations.length}
          </span>
        )}
      </div>
      {isError && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Couldn&apos;t check data health right now — it will retry shortly.
        </p>
      )}
      {violations.length > 0 && (
        // A focusable region so keyboard users can scroll the clipped list;
        // the inner <ul> keeps its list semantics for screen readers.
        <div
          role="region"
          aria-label="Data-health issues"
          tabIndex={0}
          className="mt-2 max-h-48 overflow-y-auto"
        >
          <ul className="space-y-2">
            {violations.map((v) => (
              <ViolationRow key={`${v.sponsorId}-${v.axis}`} violation={v} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
