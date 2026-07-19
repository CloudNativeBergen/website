import type { CheckStatus, SystemCheck } from '@/lib/system-status/types'
import { groupSystemChecks } from '@/lib/system-status/types'
import { StatusDot } from './StatusDot'
import { SystemStatusCard } from './SystemStatusCard'

const LEGEND: { status: CheckStatus; label: string }[] = [
  { status: 'ok', label: 'OK' },
  { status: 'warn', label: 'Degraded / fallback' },
  { status: 'error', label: 'Broken' },
  { status: 'off', label: 'Not configured' },
]

function StatusTally({ checks }: { checks: SystemCheck[] }) {
  const counts = checks.reduce<Record<CheckStatus, number>>(
    (acc, c) => {
      acc[c.status] += 1
      return acc
    },
    { ok: 0, warn: 0, error: 0, off: 0 },
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
      {LEGEND.map(({ status, label }) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <StatusDot status={status} />
          <span className="font-medium">{counts[status]}</span>
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
        </span>
      ))}
    </div>
  )
}

export function SystemStatusSection({ checks }: { checks: SystemCheck[] }) {
  const groups = groupSystemChecks(checks)
  return (
    <div className="space-y-4">
      <StatusTally checks={checks} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {groups.map((group) => (
          <SystemStatusCard key={group.group} group={group} />
        ))}
      </div>
    </div>
  )
}
