export type ProbeTone = 'success' | 'warn' | 'muted'

export interface ProbeState {
  tone: ProbeTone
  text: string
  detail?: string
}

const TONE_CLASS: Record<ProbeTone, string> = {
  success: 'text-green-700 dark:text-green-400',
  warn: 'text-amber-700 dark:text-amber-400',
  muted: 'text-gray-500 dark:text-gray-400',
}

/**
 * Presentational self-check probe tile. Pure props (no tRPC), so it can be
 * rendered in isolation in Storybook to exercise every result tone.
 */
export function ProbeCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  pending,
  state,
  onRun,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  actionLabel: string
  pending: boolean
  state: ProbeState | null
  onRun: () => void
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h4>
      </div>
      <p className="mb-4 text-xs leading-snug text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {pending ? 'Running…' : actionLabel}
      </button>
      {state && (
        <div role="status" className="mt-3 space-y-1">
          <p className={`text-sm ${TONE_CLASS[state.tone]}`}>{state.text}</p>
          {state.detail && (
            <p
              className="truncate font-mono text-xs text-gray-400 dark:text-gray-500"
              title={state.detail}
            >
              {state.detail}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
