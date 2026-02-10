/**
 * Shared UI primitives for dashboard widgets.
 *
 * These small components eliminate duplicated markup across the 12 widget files.
 */
import Link from 'next/link'

/* ---------- Loading skeleton ---------- */

export function WidgetSkeleton() {
  return (
    <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
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
    <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
      <div>
        {icon && <div className="mx-auto mb-2">{icon}</div>}
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        {children}
      </div>
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
}

export function ProgressBar({
  value,
  color = 'bg-green-600 dark:bg-green-500',
  className = 'h-2',
}: ProgressBarProps) {
  return (
    <div
      className={`overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}
