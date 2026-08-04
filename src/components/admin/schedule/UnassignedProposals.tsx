'use client'

import type { SchedulableProposal } from '@/lib/schedule/types'
import { LevelIndicator } from '@/lib/proposal'
import { Level } from '@/lib/proposal/types'
import { DraggableProposal } from './DraggableProposal'
import { useState, useMemo, useCallback } from 'react'
import { useProposalFilters } from './useProposalFilters'
import { ProposalFilters } from './ProposalFilters'

interface UnassignedProposalsProps {
  proposals: SchedulableProposal[]
}

import { getProposalDurationMinutes } from '@/lib/schedule/types'
import { PIXELS_PER_MINUTE } from '@/lib/schedule/geometry'

const VIRTUAL_SCROLL_THRESHOLD = 50

const EmptyState = ({ hasProposals }: { hasProposals: boolean }) => (
  <div className="flex h-full items-center justify-center p-8 text-center">
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {hasProposals ? 'No matches found' : 'No talks to schedule'}
    </p>
  </div>
)

export function UnassignedProposals({ proposals }: UnassignedProposalsProps) {
  const filters = useProposalFilters(proposals)
  const { filteredProposals } = filters

  const useVirtualScrolling =
    filteredProposals.length > VIRTUAL_SCROLL_THRESHOLD
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  const { virtualizedItems, totalHeight } = useMemo(() => {
    if (!useVirtualScrolling) {
      return {
        virtualizedItems: filteredProposals.map((proposal, index) => {
          const duration =
            proposal.remainingMinutes ?? getProposalDurationMinutes(proposal)
          return {
            proposal,
            index,
            offsetTop: 0,
            height: duration * PIXELS_PER_MINUTE + 8, // 8px for gap/padding
          }
        }),
        totalHeight: 0,
      }
    }

    const itemsWithLayout = []
    let currentOffset = 0
    for (let i = 0; i < filteredProposals.length; i++) {
      const p = filteredProposals[i]
      const duration = p.remainingMinutes ?? getProposalDurationMinutes(p)
      const h = duration * PIXELS_PER_MINUTE + 8 // 8px gap
      itemsWithLayout.push({
        proposal: p,
        index: i,
        offsetTop: currentOffset,
        height: h,
      })
      currentOffset += h
    }

    const totalHeight = currentOffset

    // Find visible range
    let startIndex = 0
    while (
      startIndex < itemsWithLayout.length &&
      itemsWithLayout[startIndex].offsetTop +
        itemsWithLayout[startIndex].height <
        scrollTop
    ) {
      startIndex++
    }

    let endIndex = startIndex
    while (
      endIndex < itemsWithLayout.length &&
      itemsWithLayout[endIndex].offsetTop < scrollTop + containerHeight + 200 // buffer
    ) {
      endIndex++
    }

    return {
      virtualizedItems: itemsWithLayout.slice(startIndex, endIndex + 1),
      totalHeight,
    }
  }, [filteredProposals, scrollTop, containerHeight, useVirtualScrolling])

  const handleScroll = useCallback((_e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(_e.currentTarget.scrollTop)
  }, [])

  return (
    <div
      className="sticky z-20 flex h-full w-80 flex-col bg-white shadow-sm dark:bg-gray-900"
      style={{ top: '80px' }}
    >
      <div className="relative flex min-h-[64px] w-full items-center border-b border-gray-200 bg-gray-50/50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="w-full">
          <ProposalFilters filters={filters} />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        ref={(el) => {
          if (el && containerHeight !== el.clientHeight) {
            setContainerHeight(el.clientHeight)
          }
        }}
      >
        {filteredProposals.length > 0 ? (
          useVirtualScrolling ? (
            <div className="relative" style={{ height: totalHeight }}>
              {virtualizedItems.map(({ proposal, offsetTop, height }) => (
                <div
                  key={proposal._id}
                  className="absolute right-0 left-0 px-4 py-1"
                  style={{
                    top: offsetTop,
                    height: height,
                  }}
                >
                  <div className="overflow-hidden">
                    <DraggableProposal
                      proposal={proposal}
                      durationMinutes={proposal.remainingMinutes}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {virtualizedItems.map(({ proposal }) => (
                <div key={proposal._id} className="overflow-hidden">
                  <DraggableProposal
                    proposal={proposal}
                    durationMinutes={proposal.remainingMinutes}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState hasProposals={proposals.length > 0} />
        )}
      </div>

      <div className="border-t border-gray-200 bg-gray-50/50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Status:
            </span>
            <div className="h-2.5 w-2.5 rounded border-2 border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/50"></div>
            <span>Accepted</span>
            <div className="h-2.5 w-2.5 rounded border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"></div>
            <span>Confirmed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Level:
            </span>
            <LevelIndicator level={Level.beginner} size="xs" />
            <span>Beg</span>
            <LevelIndicator level={Level.intermediate} size="xs" />
            <span>Int</span>
            <LevelIndicator level={Level.advanced} size="xs" />
            <span>Adv</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Topic:
            </span>
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500"></div>
            <span>Single</span>
            <div className="h-2.5 w-3 border-l-[3px] border-orange-500"></div>
            <span>Multi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Audience:
            </span>
            <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-gray-700 dark:text-gray-300">
              DEV +1
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
