import { Children, type ReactElement } from 'react'

/** Task preselection adds a pinned copy while preserving every card in the grid. */
export function StudioCardGrid({
  children,
  selectedId,
  label,
  className,
  pinnedTitle = 'Card for your Task',
}: {
  children: ReactElement[]
  selectedId?: string
  label: string
  className: string
  /** What the pinned card is: a Task's, or one opened from the gallery. */
  pinnedTitle?: string
}) {
  const pinned = children.find((card) => card.key === selectedId)
  return (
    <div className="space-y-6">
      {selectedId &&
        (pinned ? (
          <section
            aria-label={pinnedTitle}
            className="rounded-xl border-2 border-brand-cloud-blue bg-blue-50 p-4 dark:border-blue-400 dark:bg-blue-950/30"
          >
            <h3 className="mb-4 font-semibold text-brand-cloud-blue dark:text-blue-300">
              {pinnedTitle}
            </h3>
            {pinned}
          </section>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The selected card is unavailable. Choose from the cards below.
          </p>
        ))}
      <section aria-label={`All ${label}`}>
        {selectedId && <h3 className="mb-4 font-semibold">All {label}</h3>}
        <div className={className}>{Children.toArray(children)}</div>
      </section>
    </div>
  )
}
