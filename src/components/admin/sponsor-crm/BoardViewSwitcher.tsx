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
    <div className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
      {VIEWS.map((view) => {
        const Icon = view.icon
        const isActive = currentView === view.key

        return (
          <button
            key={view.key}
            onClick={() => onViewChange(view.key)}
            className={clsx(
              'flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              isActive
                ? 'bg-white text-brand-cloud-blue shadow-sm ring-1 ring-gray-200 dark:bg-gray-700 dark:text-blue-400 dark:ring-gray-600'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden lg:inline">{view.label}</span>
          </button>
        )
      })}
    </div>
  )
}
