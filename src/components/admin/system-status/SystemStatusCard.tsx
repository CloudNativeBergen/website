import type { SystemCheckGroup } from '@/lib/system-status/types'
import { worstStatus } from '@/lib/system-status/types'
import { StatusDot } from './StatusDot'
import { SystemCheckRow } from './SystemCheckRow'

export function SystemStatusCard({ group }: { group: SystemCheckGroup }) {
  const rollup = worstStatus(group.checks)
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-3 flex items-center gap-2">
        <StatusDot status={rollup} />
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {group.label}
        </h3>
      </div>
      <div>
        {group.checks.map((check) => (
          <SystemCheckRow key={check.id} check={check} />
        ))}
      </div>
    </div>
  )
}
