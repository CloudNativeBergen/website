import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

/**
 * A failed sales analysis, rendered as a failure.
 *
 * There is deliberately no substitute analysis behind this. `/admin/tickets`
 * used to swallow the exception, return the same `null` that means "no
 * tickets", and let the client replace it with `createDefaultAnalysis` — whose
 * performance block is literal zeros with `isOnTrack: true`. A conference badly
 * behind target then rendered "Target Progress 0.0% · On Track" beside its real
 * sales numbers, with nothing on screen signalling that anything had failed.
 *
 * The breakdown tables below it on the page read the tickets directly and are
 * unaffected, so the copy says so rather than implying the whole page is wrong.
 */
export function AnalysisUnavailable({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <div className="flex gap-3">
        <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500 dark:text-red-400" />
        <div>
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
            Sales analysis unavailable
          </h3>
          <p className="mt-1 text-sm text-red-800 dark:text-red-300">
            The ticket sales analysis could not be computed, so no target
            progress, sales chart or participant figures are shown. The ticket
            data itself is unaffected — the breakdown tables below are still
            accurate.
          </p>
          <p className="mt-2 font-mono text-xs break-words text-red-700 dark:text-red-400">
            {error}
          </p>
        </div>
      </div>
    </div>
  )
}
