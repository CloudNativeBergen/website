'use client'

import {
  RectangleStackIcon,
  DocumentTextIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

export type BoardView = 'pipeline' | 'contract' | 'invoice'

interface BoardViewSwitcherProps {
  currentView: BoardView
  onViewChange: (view: BoardView) => void
}

const VIEWS: Array<{
  key: BoardView
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = [
  { key: 'pipeline', label: 'Full Pipeline', icon: RectangleStackIcon },
  { key: 'contract', label: 'Contract Board', icon: DocumentTextIcon },
  { key: 'invoice', label: 'Invoice Board', icon: BanknotesIcon },
]

export function BoardViewSwitcher({
  currentView,
  onViewChange,
}: BoardViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
      {VIEWS.map((view) => {
        const Icon = view.icon
        const isActive = currentView === view.key

        return (
          <button
            key={view.key}
            onClick={() => onViewChange(view.key)}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
              isActive
                ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{view.label}</span>
          </button>
        )
      })}
    </div>
  )
}
