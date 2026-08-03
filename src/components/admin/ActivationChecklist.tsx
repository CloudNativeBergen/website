import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { RocketLaunchIcon } from '@heroicons/react/24/outline'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { StatusBadge } from '@/components/StatusBadge'
import type {
  ActivationChecklist as ActivationChecklistData,
  ActivationRow,
} from '@/lib/settings/activation'

/**
 * "Get started" activation checklist card (onboarding S4).
 *
 * A read-only, server-safe presentational surface: it renders an
 * already-derived {@link ActivationChecklistData} (see
 * `@/lib/settings/activation`) — it never reads conference data or probes
 * anything itself. It sits at the TOP of the Settings "Configuration" tier and
 * answers "what do I still need to configure to launch?".
 *
 * The card auto-collapses (`defaultOpen = !allDone`) once every REQUIRED row is
 * satisfied, so a fully configured conference sees only a compact "Ready to
 * launch" header. Each row deep-links to the relevant group / card anchor.
 *
 * headingLevel={3}: the card sits directly under the Configuration `h2`, so its
 * disclosure heading is an `h3` (the grouped subsections below are also h3).
 */
export function ActivationChecklist({
  checklist,
}: {
  checklist: ActivationChecklistData
}) {
  const { rows, done, required, allDone } = checklist
  const pct = required === 0 ? 100 : Math.round((done / required) * 100)

  return (
    <CollapsibleSection
      headingLevel={3}
      title="Get started"
      icon={<RocketLaunchIcon />}
      defaultOpen={!allDone}
      action={
        // Compact so the "Get started" title is never squeezed to an ellipsis
        // on a narrow (393px) viewport, where the disclosure's Hide/Show label
        // and chevron already consume header width.
        allDone ? (
          <StatusBadge label="Ready" color="green" />
        ) : (
          <StatusBadge label={`${done}/${required}`} color="gray" />
        )
      }
    >
      <div className="space-y-4 px-6 py-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Launch readiness
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {done}/{required} required steps
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={required}
            aria-label="Launch readiness"
          >
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ul className="space-y-1">
          {rows.map((row) => (
            <ActivationRowItem key={row.id} row={row} />
          ))}
        </ul>
      </div>
    </CollapsibleSection>
  )
}

/**
 * One checklist row — a link with a done/pending icon and a hint. A `#…` target
 * is a same-page jump (a plain anchor); a `/admin/…` target is a settings
 * sub-page and routes through `Link` so it stays a client navigation.
 */
function ActivationRowItem({ row }: { row: ActivationRow }) {
  const RowLink = row.anchor.startsWith('#') ? 'a' : Link
  return (
    <li>
      <RowLink
        href={row.anchor}
        className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <span className="mt-0.5 shrink-0">
          {row.done ? (
            <CheckCircleIcon className="h-5 w-5 text-green-500 dark:text-green-400" />
          ) : (
            <span
              aria-hidden="true"
              className={`block h-5 w-5 rounded-full border-2 ${
                row.optional
                  ? 'border-dashed border-gray-300 dark:border-gray-600'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-medium ${
                row.done
                  ? 'text-gray-500 line-through dark:text-gray-500'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {row.label}
            </span>
            {row.optional && <StatusBadge label="Optional" color="gray" />}
          </span>
          {!row.done && (
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              {row.hint}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-xs font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-indigo-400"
        >
          Configure &rarr;
        </span>
      </RowLink>
    </li>
  )
}
