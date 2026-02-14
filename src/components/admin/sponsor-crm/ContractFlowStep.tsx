import { CheckIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

export type ContractFlowStepStatus = 'pending' | 'active' | 'complete'

export interface ContractFlowStepProps {
  step: number
  title: string
  status: ContractFlowStepStatus
  isLast?: boolean
  children: React.ReactNode
}

export function ContractFlowStep({
  step,
  title,
  status,
  isLast,
  children,
}: ContractFlowStepProps) {
  return (
    <div className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className={clsx(
            'absolute top-7 left-3 w-0.5',
            status === 'complete'
              ? 'bg-green-300 dark:bg-green-700'
              : 'bg-gray-200 dark:bg-gray-700',
          )}
          style={{ bottom: '-1rem' }}
        />
      )}

      {/* Step indicator */}
      <div
        className={clsx(
          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          status === 'complete' &&
          'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
          status === 'active' &&
          'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500',
          status === 'pending' &&
          'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
        )}
      >
        {status === 'complete' ? <CheckIcon className="h-3.5 w-3.5" /> : step}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <h4
          className={clsx(
            'text-sm font-semibold',
            status === 'complete' && 'text-green-700 dark:text-green-400',
            status === 'active' && 'text-gray-900 dark:text-white',
            status === 'pending' && 'text-gray-400 dark:text-gray-500',
          )}
        >
          {title}
        </h4>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}
