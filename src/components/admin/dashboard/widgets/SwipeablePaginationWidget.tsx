'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import {
  SWIPE_THRESHOLD_PX,
  SWIPE_ANIMATION_MS,
} from '@/lib/dashboard/constants'

/**
 * Swipeable Pagination Widget - POC
 *
 * Demonstrates how to handle swipe gestures for paginating through content.
 * This can be used as a middle ground between showing all items (causing overflow)
 * and hiding items (losing information).
 *
 * Features:
 * - Touch/mouse swipe gestures
 * - Keyboard navigation (arrow keys)
 * - Page indicators (dots)
 * - Optional navigation arrows
 * - Smooth animations
 * - Works with any content (lists, cards, etc.)
 */

interface SwipeablePaginationWidgetProps {
  title: string
  pages: React.ReactNode[]
  showArrows?: boolean
  showDots?: boolean
}

export function SwipeablePaginationWidget({
  title,
  pages,
  showArrows = true,
  showDots = true,
}: SwipeablePaginationWidgetProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalPages = pages.length

  // Handle swipe gesture
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    setDragStartX(e.clientX)
    setDragOffset(0)
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const offset = e.clientX - dragStartX
    setDragOffset(offset)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)

    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId)
    }

    // Determine if swipe was significant enough
    if (Math.abs(dragOffset) > SWIPE_THRESHOLD_PX) {
      if (dragOffset > 0 && currentPage > 0) {
        setCurrentPage(currentPage - 1)
      } else if (dragOffset < 0 && currentPage < totalPages - 1) {
        setCurrentPage(currentPage + 1)
      }
    }
    setDragOffset(0)
  }

  // Keyboard navigation (scoped to focused widget)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPage > 0) {
        setCurrentPage(currentPage - 1)
      } else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {
        setCurrentPage(currentPage + 1)
      }
    },
    [currentPage, totalPages],
  )

  const goToPage = (pageIndex: number) => {
    setCurrentPage(Math.max(0, Math.min(pageIndex, totalPages - 1)))
  }

  const goToPrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1)
  }

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1)
  }

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {showDots && totalPages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: totalPages }).map((_, index) => (
              <button
                key={index}
                onClick={() => goToPage(index)}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  index === currentPage
                    ? 'w-3 bg-blue-600 dark:bg-blue-500'
                    : 'bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500'
                }`}
                aria-label={`Go to page ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Swipeable content container */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="h-full touch-pan-y select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div
            className="flex h-full transition-transform"
            style={{
              transform: `translateX(calc(-${currentPage * 100}% + ${dragOffset}px))`,
              transitionDuration: isDragging
                ? '0ms'
                : `${SWIPE_ANIMATION_MS}ms`,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {pages.map((page, index) => (
              <div
                key={index}
                className="h-full w-full shrink-0"
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
              >
                {page}
              </div>
            ))}
          </div>
        </div>

        {/* Optional navigation arrows - positioned at absolute edges */}
        {showArrows && totalPages > 1 && (
          <>
            {currentPage > 0 && (
              <button
                onClick={goToPrevPage}
                className="absolute top-1/2 -left-2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow-lg transition-all hover:bg-white hover:shadow-xl dark:bg-gray-800/90 dark:hover:bg-gray-800"
                aria-label="Previous page"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
            )}
            {currentPage < totalPages - 1 && (
              <button
                onClick={goToNextPage}
                className="absolute top-1/2 -right-2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow-lg transition-all hover:bg-white hover:shadow-xl dark:bg-gray-800/90 dark:hover:bg-gray-800"
                aria-label="Next page"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Page counter (optional) */}
      {totalPages > 1 && (
        <div className="mt-2 text-center text-[10px] text-gray-500 dark:text-gray-400">
          {currentPage + 1} / {totalPages}
        </div>
      )}
    </div>
  )
}
