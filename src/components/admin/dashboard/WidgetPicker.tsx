'use client'

import { useState, useMemo } from 'react'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widget-registry'
import type { WidgetMetadata } from '@/lib/dashboard/widget-metadata'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import * as HeroIcons from '@heroicons/react/24/outline'

interface WidgetPickerProps {
  onSelect: (widgetType: string) => void
  onClose: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  analytics: 'Analytics',
  operations: 'Operations',
  engagement: 'Engagement',
}

const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; icon: string; hover: string; border: string }
> = {
  core: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400',
    hover: 'hover:border-blue-400 dark:hover:border-blue-500',
    border: 'border-blue-200 dark:border-blue-800',
  },
  analytics: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400',
    hover: 'hover:border-purple-400 dark:hover:border-purple-500',
    border: 'border-purple-200 dark:border-purple-800',
  },
  operations: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-700 dark:text-green-300',
    icon: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400',
    hover: 'hover:border-green-400 dark:hover:border-green-500',
    border: 'border-green-200 dark:border-green-800',
  },
  engagement: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    text: 'text-orange-700 dark:text-orange-300',
    icon: 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400',
    hover: 'hover:border-orange-400 dark:hover:border-orange-500',
    border: 'border-orange-200 dark:border-orange-800',
  },
}

const CATEGORY_ORDER = ['core', 'analytics', 'operations', 'engagement']

export function WidgetPicker({ onSelect, onClose }: WidgetPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const widgets = useMemo(() => {
    return Object.values(WIDGET_REGISTRY)
  }, [])

  const widgetCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    widgets.forEach((widget) => {
      counts[widget.category] = (counts[widget.category] || 0) + 1
    })
    return counts
  }, [widgets])

  const filteredWidgets = useMemo(() => {
    return widgets.filter((widget) => {
      const matchesSearch =
        !searchQuery ||
        widget.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        widget.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        widget.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        )

      const matchesCategory =
        !selectedCategory || widget.category === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [widgets, searchQuery, selectedCategory])

  const groupedWidgets = useMemo(() => {
    const groups: Record<string, WidgetMetadata[]> = {}
    filteredWidgets.forEach((widget) => {
      if (!groups[widget.category]) {
        groups[widget.category] = []
      }
      groups[widget.category].push(widget)
    })
    return groups
  }, [filteredWidgets])

  const getIconComponent = (iconName: string) => {
    const Icon = (
      HeroIcons as Record<string, React.ComponentType<{ className?: string }>>
    )[iconName]
    return Icon || HeroIcons.Square3Stack3DIcon
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 w-full max-w-4xl rounded-xl bg-white shadow-2xl duration-200 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-linear-to-r from-gray-50 to-white px-6 py-5 dark:border-gray-700 dark:from-gray-800 dark:to-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              ✨ Add a Widget
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Choose from {widgets.length} powerful widgets to customize your
              dashboard
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search widgets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none dark:text-white dark:placeholder-gray-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white dark:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {CATEGORY_ORDER.map((category) => {
              const colors = CATEGORY_COLORS[category]
              const count = widgetCounts[category] || 0
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedCategory === category
                      ? `${colors.bg} ${colors.text} shadow-sm`
                      : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {CATEGORY_LABELS[category]}
                  <span className="ml-1.5 opacity-75">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Widget Grid */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {CATEGORY_ORDER.map((category) => {
            const categoryWidgets = groupedWidgets[category]
            if (!categoryWidgets || categoryWidgets.length === 0) return null

            const colors = CATEGORY_COLORS[category]

            return (
              <div key={category} className="mb-6 last:mb-0">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className={`text-sm font-semibold ${colors.text}`}>
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {categoryWidgets.length} widget
                    {categoryWidgets.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryWidgets.map((widget) => {
                    const Icon = getIconComponent(widget.icon)
                    return (
                      <button
                        key={widget.type}
                        onClick={() => onSelect(widget.type)}
                        className={`group flex items-start gap-3 rounded-lg border ${colors.border} bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${colors.hover} dark:bg-gray-900`}
                      >
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colors.icon} transition-transform group-hover:scale-110`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                            {widget.displayName}
                          </h4>
                          <p className="mb-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                            {widget.description}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {widget.tags?.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className={`rounded-full ${colors.bg} px-2 py-0.5 text-xs ${colors.text}`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {filteredWidgets.length === 0 && (
            <div className="py-16 text-center">
              <div className="mb-3 text-4xl">🔍</div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                No widgets found
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
