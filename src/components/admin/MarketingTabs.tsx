'use client'

import { useState } from 'react'
import {
  PresentationChartBarIcon,
  UserGroupIcon,
  TrophyIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

type IconType = 'presentation' | 'users' | 'trophy' | 'sparkles'

interface Tab {
  id: string
  name: string
  icon: IconType
  count: number
  description: string
}

interface MarketingTabsProps {
  tabs: Tab[]
  children: React.ReactNode[]
  defaultTab?: string
}

const iconMap = {
  presentation: PresentationChartBarIcon,
  users: UserGroupIcon,
  trophy: TrophyIcon,
  sparkles: SparklesIcon,
} as const

export function MarketingTabs({
  tabs,
  children,
  defaultTab,
}: MarketingTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '')
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTab)

  // Guard against tabs/children length mismatches
  if (tabs.length !== children.length) {
    console.error(
      `MarketingTabs: tabs.length (${tabs.length}) does not match children.length (${children.length})`,
    )
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          Configuration Error: Number of tabs does not match number of content
          panels.
        </p>
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">
          Expected {tabs.length} content panels, but got {children.length}.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <nav
          className="flex space-x-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
          aria-label="Marketing Materials"
        >
          {tabs.map((tab) => {
            const Icon = iconMap[tab.icon]
            const isActive = tab.id === activeTab

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-brand-cloud-blue shadow-sm dark:bg-gray-700 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-white/50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:hover:text-white'
                }`}
                aria-selected={isActive}
                role="tab"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="font-space-grotesk hidden font-semibold sm:inline">
                  {tab.name}
                </span>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isActive
                      ? 'bg-brand-cloud-blue/10 text-brand-cloud-blue dark:bg-blue-300/10 dark:text-blue-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </nav>

        {tabs[activeTabIndex] && (
          <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <p className="font-inter text-sm text-gray-700 dark:text-gray-300">
              {tabs[activeTabIndex].description}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        {activeTabIndex >= 0 && children[activeTabIndex]}
      </div>
    </div>
  )
}
