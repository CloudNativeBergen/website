import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { RocketLaunchIcon } from '@heroicons/react/24/outline'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { StatusBadge } from '@/components/StatusBadge'
import {
  ACTIVATION_CHECKLIST_ANCHOR,
  type ActivationChecklist as ActivationChecklistData,
  type ActivationRow,
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
 * THE ANCHOR IS PART OF THE CONTRACT. The wrapper carries
 * `ACTIVATION_CHECKLIST_ANCHOR`, which is where the `/admin` hero and the
 * unlisted banner send an organizer who asks for the full list. Before #839
 * the only setup affordance in the shell pointed at `#visibility` — an anchor
 * BELOW this card — dropping a half-configured tenant straight onto the
 * publish switch.
 *
 * headingLevel={3}: the card sits directly under the Configuration `h2`, so its
 * disclosure heading is an `h3` (the grouped subsections below are also h3).
 */
export function ActivationChecklist({
  checklist,
}: {
  checklist: ActivationChecklistData
}) {
  const { stages, done, required, allDone } = checklist
  const pct = required === 0 ? 100 : Math.round((done / required) * 100)

  return (
    <div id={ACTIVATION_CHECKLIST_ANCHOR} className="scroll-mt-24">
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
        <div className="space-y-5 px-6 py-4">
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

          {/* Two stages, not one flat list: the CFP critical path first, the
              rest of the launch prep after it. Same grouping the /admin hero
              titles itself with, so the two surfaces tell one story. */}
          {stages.map((stage) => (
            <section key={stage.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {stage.title}
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {stage.done}/{stage.required}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {stage.description}
              </p>
              <ul className="space-y-1 pt-1">
                {stage.rows.map((row) => (
                  <ActivationRowItem key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}

/**
 * One checklist row — a link with a done/pending icon and a hint. A `#…` target
 * is a same-page jump (a plain anchor); a `/admin/…` target is a settings
 * sub-page and routes through `Link` so it stays a client navigation.
 *
 * An `unavailable` row is NOT a link. There is nothing behind the anchor this
 * organizer can act on, and an affordance that navigates to a dead end is the
 * failure #839 is about; it renders as a muted, badged line instead.
 *
 * Exported because the `/admin` activation hero renders the same rows — the
 * hero is a different frame around this identical line, never a second
 * rendering of the steps that could drift from this one.
 */
export function ActivationRowItem({ row }: { row: ActivationRow }) {
  const rowClass =
    'group flex items-start gap-3 rounded-md px-2 py-2 transition-colors'
  const body = (
    <>
      <span className="mt-0.5 shrink-0">
        {row.done ? (
          <CheckCircleIcon className="h-5 w-5 text-green-500 dark:text-green-400" />
        ) : (
          <span
            aria-hidden="true"
            className={`block h-5 w-5 rounded-full border-2 ${
              row.optional || row.unavailable
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
                : row.unavailable
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-900 dark:text-white'
            }`}
          >
            {row.label}
          </span>
          {row.unavailable ? (
            <StatusBadge label={row.unavailable} color="gray" />
          ) : row.optional ? (
            <StatusBadge label="Optional" color="gray" />
          ) : null}
        </span>
        {/* An outstanding row shows what to do; a done row normally shows
            nothing — except a `note`, the advisory for a requirement that is
            satisfied by something the organizer did not choose (the seeded
            starter formats), where a bare strike-through would overstate. An
            unavailable row ALWAYS shows its hint: there the hint is not an
            instruction but the explanation of why the row is not theirs. */}
        {row.unavailable || !row.done ? (
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {row.hint}
          </span>
        ) : row.note ? (
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {row.note}
          </span>
        ) : null}
      </span>
    </>
  )

  if (row.unavailable) {
    return (
      <li>
        <div className={rowClass}>{body}</div>
      </li>
    )
  }

  const RowLink = row.anchor.startsWith('#') ? 'a' : Link
  return (
    <li>
      <RowLink
        href={row.anchor}
        className={`${rowClass} hover:bg-gray-50 dark:hover:bg-gray-800`}
      >
        {body}
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
