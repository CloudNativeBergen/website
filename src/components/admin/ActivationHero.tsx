import Link from 'next/link'
import { RocketLaunchIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { ActivationRowItem } from './ActivationChecklist'
import {
  ACTIVATION_CHECKLIST_HREF,
  currentActivationStage,
  nextActivationSteps,
  type ActivationChecklist as ActivationChecklistData,
} from '@/lib/settings/activation'

/**
 * The activation hero on `/admin` (#839).
 *
 * WHY IT EXISTS. The checklist was already well built — it was simply on
 * `/admin/settings`, a screen a brand-new organizer has no reason to visit. The
 * dashboard they DO land on showed seven mostly-empty widgets and the only
 * setup prompt in the shell deep-linked past the checklist to the publish
 * switch. Placement, not copy, was the defect; this component is the fix, and
 * it is deliberately a FRAME around the existing derivation
 * (`buildActivationChecklist`) and the existing row renderer
 * (`ActivationRowItem`) rather than a second telling of the steps. Restating
 * them here is the one thing that would make this worse than the bug.
 *
 * WHAT IT SHOWS. The stage the organizer is currently on, overall progress, and
 * the next TWO outstanding required steps — no more. For a freshly provisioned
 * tenant those two are exactly the real critical path (`cfp-window` and
 * `topics`; `formats` is seeded by provisioning since #833), so the hero opens
 * on the whole of what stands between them and a proposal in the inbox. A
 * `unavailable` row can never surface here — see `nextActivationSteps`.
 *
 * NOT DISMISSIBLE, on purpose. While a required row is outstanding this is the
 * only signpost to the checklist anywhere in the admin shell, so a dismiss
 * control would restore the exact state #839 describes, with the added insult
 * that the organizer chose it. It removes itself the moment the last required
 * row is done, which is the honest version of dismissal — and callers render it
 * only while `allDone` is false, so a completed tenant sees today's dashboard,
 * unchanged.
 */
export function ActivationHero({
  checklist,
}: {
  checklist: ActivationChecklistData
}) {
  const stage = currentActivationStage(checklist)
  const steps = nextActivationSteps(checklist)
  // Nothing outstanding: the hero has no job. Callers gate on `allDone` too;
  // this is the belt to that pair of braces, so the component can never render
  // an empty exhortation.
  if (!stage || steps.length === 0) return null

  const { done, required } = checklist
  const pct = required === 0 ? 100 : Math.round((done / required) * 100)
  const remaining = required - done

  return (
    <section
      aria-labelledby="activation-hero-title"
      className="mb-6 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-indigo-500/20 dark:bg-gray-900 dark:ring-indigo-400/30"
    >
      <div className="space-y-4 border-l-4 border-indigo-500 p-5 sm:p-6 dark:border-indigo-400">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-3">
            <RocketLaunchIcon
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 text-indigo-600 dark:text-indigo-400"
            />
            <div className="min-w-0">
              <h2
                id="activation-hero-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {stage.title}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {stage.description}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-gray-500 tabular-nums dark:text-gray-400">
            {done}/{required} done
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

        <ul className="space-y-1">
          {steps.map((row) => (
            <ActivationRowItem key={row.id} row={row} />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-gray-200 pt-3 dark:border-gray-700">
          <Link
            href={ACTIVATION_CHECKLIST_HREF}
            className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            See the full checklist
            <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
          </Link>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {remaining} step{remaining === 1 ? '' : 's'} left before you can go
            live
          </span>
        </div>
      </div>
    </section>
  )
}
