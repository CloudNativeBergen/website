import type { CheckStatus } from '@/lib/system-status/types'

const DOT_CLASSES: Record<CheckStatus, string> = {
  ok: 'bg-green-500 dark:bg-green-400',
  warn: 'bg-amber-500 dark:bg-amber-400',
  error: 'bg-red-500 dark:bg-red-400',
  off: 'bg-gray-400 dark:bg-gray-500',
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warn: 'Warning',
  error: 'Error',
  off: 'Not configured',
}

export function StatusDot({
  status,
  className = '',
}: {
  status: CheckStatus
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={`inline-block size-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900 ${DOT_CLASSES[status]} ${className}`}
    />
  )
}
