import type { SystemCheck } from '@/lib/system-status/types'
import { StatusDot } from './StatusDot'

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

export function SystemCheckRow({ check }: { check: SystemCheck }) {
  const { label, value, detail, status } = check
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-800">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1.5">
          <StatusDot status={status} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium break-words text-gray-900 dark:text-white">
            {label}
          </p>
          {detail && (
            <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">
              {detail}
            </p>
          )}
        </div>
      </div>
      {value !== undefined && (
        <div className="max-w-[45%] shrink-0 text-right">
          {isHttpUrl(value) ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs break-all text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {value}
            </a>
          ) : (
            <span className="font-mono text-xs break-all text-gray-700 dark:text-gray-300">
              {value}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
