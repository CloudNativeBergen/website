'use client'

import { useState, useMemo, memo, useCallback } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { ChartBarIcon } from '@heroicons/react/24/solid'
import { ProposalExisting } from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'
import { levels, audiences } from '@/lib/proposal/types'

interface ProposalStatisticsProps {
  proposals: ProposalExisting[]
}

interface StatItem {
  label: string
  count: number
  percentage: number
  color?: string
}

interface StatSection {
  title: string
  items: StatItem[]
  total: number
}

function calculateStats<T extends string>(
  proposals: ProposalExisting[],
  getAttribute: (proposal: ProposalExisting) => T | T[],
  labelMap: Map<T, string>,
): StatSection {
  if (proposals.length === 0) {
    return { title: '', items: [], total: 0 }
  }

  const counts = new Map<T, number>()
  const total = proposals.length

  proposals.forEach((proposal) => {
    const value = getAttribute(proposal)
    if (Array.isArray(value)) {
      value.forEach((v) => {
        counts.set(v, (counts.get(v) || 0) + 1)
      })
    } else if (value) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  })

  const items: StatItem[] = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({
      label: labelMap.get(key) || key,
      count,
      percentage: Math.round((count / total) * 100),
    }))

  return {
    title: '',
    items,
    total,
  }
}

function calculateTopicStats(proposals: ProposalExisting[]): StatSection {
  if (proposals.length === 0) {
    return { title: 'Topics', items: [], total: 0 }
  }

  const counts = new Map<
    string,
    { count: number; title: string; color?: string }
  >()
  const total = proposals.length

  proposals.forEach((proposal) => {
    const topics = proposal.topics
    if (!topics?.length) return

    topics.forEach((topic) => {
      if (typeof topic === 'object' && topic && '_id' in topic) {
        const topicData = topic as Topic
        const existing = counts.get(topicData._id)
        if (existing) {
          existing.count++
        } else {
          counts.set(topicData._id, {
            count: 1,
            title: topicData.title,
            color: topicData.color,
          })
        }
      }
    })
  })

  const items: StatItem[] = Array.from(counts.values())
    .filter((data) => data.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((data) => ({
      label: data.title,
      count: data.count,
      percentage: Math.round((data.count / total) * 100),
      color: data.color,
    }))

  return {
    title: 'Topics',
    items,
    total,
  }
}

const StatBar = memo(function StatBar({
  item,
  maxCount,
}: {
  item: StatItem
  maxCount: number
}) {
  const width = maxCount > 0 ? Math.round((item.count / maxCount) * 100) : 0

  const backgroundColor = useMemo(() => {
    if (!item.color) return undefined
    return item.color.startsWith('#') ? item.color : `#${item.color}`
  }, [item.color])

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {item.label}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">
              {item.count}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              ({item.percentage}%)
            </span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${!backgroundColor ? 'bg-indigo-600 dark:bg-indigo-500' : ''}`}
            style={{
              width: `${width}%`,
              backgroundColor,
            }}
          />
        </div>
      </div>
    </div>
  )
})

const StatSection = memo(function StatSection({
  title,
  section,
}: {
  title: string
  section: StatSection
}) {
  const maxCount = useMemo(
    () =>
      section.items.length > 0
        ? Math.max(...section.items.map((item) => item.count))
        : 0,
    [section.items],
  )

  if (section.items.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </h4>
      <div className="space-y-2">
        {section.items.map((item) => (
          <StatBar
            key={`${item.label}-${item.count}`}
            item={item}
            maxCount={maxCount}
          />
        ))}
      </div>
    </div>
  )
})

export const ProposalStatistics = memo(function ProposalStatistics({
  proposals,
}: ProposalStatisticsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const statistics = useMemo(() => {
    if (proposals.length === 0) {
      return null
    }

    return {
      levelStats: calculateStats(proposals, (p) => p.level, levels),
      topicStats: calculateTopicStats(proposals),
      audienceStats: calculateStats(
        proposals,
        (p) => p.audiences || [],
        audiences,
      ),
    }
  }, [proposals])

  if (!statistics) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:ring-inset dark:hover:bg-gray-700 dark:focus:ring-indigo-400"
        aria-expanded={isExpanded}
        aria-controls="proposal-statistics-content"
      >
        <div className="flex items-center gap-3">
          <ChartBarIcon
            className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Proposal Statistics
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({proposals.length} proposal{proposals.length !== 1 ? 's' : ''})
          </span>
        </div>
        {isExpanded ? (
          <ChevronDownIcon
            className="h-4 w-4 text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          />
        ) : (
          <ChevronRightIcon
            className="h-4 w-4 text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          />
        )}
      </button>

      {isExpanded && (
        <div
          id="proposal-statistics-content"
          className="border-t border-gray-200 px-4 pb-4 dark:border-gray-700"
        >
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
            <StatSection title="Level" section={statistics.levelStats} />
            <StatSection title="Topics" section={statistics.topicStats} />
            <StatSection title="Audience" section={statistics.audienceStats} />
          </div>
        </div>
      )}
    </div>
  )
})
