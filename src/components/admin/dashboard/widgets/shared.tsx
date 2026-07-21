/**
 * Shared UI primitives for dashboard widgets.
 *
 * These small components eliminate duplicated markup across the 12 widget files.
 */
import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

/* ---------- Loading skeleton ---------- */

/*
 * The `min-h-32` on the states below matters in single-column (mobile) mode:
 * there the grid row height is auto, so a bare `h-full` collapses to 0 and
 * loading/empty/error widgets vanished entirely.
 */

export function WidgetSkeleton() {
  return (
    <div className="h-full min-h-32 rounded-lg bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" />
  )
}

/* ---------- Empty / no-data state ---------- */

interface WidgetEmptyStateProps {
  message: string
  icon?: React.ReactNode
  children?: React.ReactNode
}

export function WidgetEmptyState({
  message,
  icon,
  children,
}: WidgetEmptyStateProps) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
      <div>
        {icon && <div className="mx-auto mb-2">{icon}</div>}
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        {children}
      </div>
    </div>
  )
}

/* ---------- Error state ---------- */

interface WidgetErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function WidgetErrorState({
  message = 'Failed to load data',
  onRetry,
}: WidgetErrorStateProps) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
      <div>
        <ExclamationTriangleIcon className="mx-auto mb-2 h-8 w-8 text-red-400 dark:text-red-500" />
        <p className="text-sm font-medium text-red-700 dark:text-red-300">
          {message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- Widget body (the height contract) ---------- */

interface WidgetBodyProps {
  /** Extra classes merged onto the scroll region (e.g. `flex flex-col`). */
  className?: string
  children: React.ReactNode
}

/**
 * THE standard content region of a widget — and the house height contract.
 *
 * WidgetContainer clips (`overflow-hidden` + fixed grid height), so any
 * variable-height widget content MUST live inside a WidgetBody: `min-h-0
 * flex-1` lets it absorb whatever height the row span grants, and
 * `overflow-y-auto` makes taller-than-slot content scroll instead of
 * silently clipping. Fixed chrome (WidgetHeader, pinned footers) stays
 * OUTSIDE as shrink-0 siblings; the widget root must be `flex h-full
 * flex-col` for the flex-1 to bite.
 *
 * `overscroll-contain` stops a widget's inner scroll from chaining into the
 * page scroll (same convention as ModalShell/BottomSheet). Scrollbars are the
 * platform default, matching the widgets that already scrolled.
 *
 * Centering caveat: do NOT combine this with `justify-center` on the scroll
 * region itself — centered overflow clips at the top unreachably. Center an
 * inner wrapper with `m-auto` instead.
 */
export function WidgetBody({ className = '', children }: WidgetBodyProps) {
  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </div>
  )
}

/* ---------- Widget header ---------- */

interface WidgetHeaderProps {
  title: string
  badge?: React.ReactNode
  link?: { href: string; label: string }
}

export function WidgetHeader({ title, badge, link }: WidgetHeaderProps) {
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between">
      <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {badge}
      {link && (
        <Link
          href={link.href}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {link.label}
        </Link>
      )}
    </div>
  )
}

/* ---------- Phase badge ---------- */

const PHASE_BADGE_VARIANTS = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
} as const

interface PhaseBadgeProps {
  label: string
  variant: keyof typeof PHASE_BADGE_VARIANTS
}

export function PhaseBadge({ label, variant }: PhaseBadgeProps) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PHASE_BADGE_VARIANTS[variant]}`}
    >
      {label}
    </span>
  )
}

/* ---------- Progress bar ---------- */

interface ProgressBarProps {
  value: number
  color?: string
  className?: string
  /** Accessible name for the progress bar (e.g. "Review progress"). */
  label?: string
}

export function ProgressBar({
  value,
  color = 'bg-green-600 dark:bg-green-500',
  className = 'h-2',
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(value, 100))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={`overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
