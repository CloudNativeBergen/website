'use client'

import { useEffect, useRef, useState } from 'react'
import { BlueskyFeed } from './BlueskyFeed'

interface ScrollFadeBlueskyFeedProps {
  blueskyHandle: string
  postCount?: number
  compact?: boolean
  className?: string
}

export function ScrollFadeBlueskyFeed({
  blueskyHandle,
  postCount = 1,
  compact = true,
  className = '',
}: ScrollFadeBlueskyFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    const handleScroll = () => {
      if (!feedRef.current) return

      const element = feedRef.current
      const rect = element.getBoundingClientRect()

      // Get the speaker image section height (approximately)
      // The speaker image is sticky with top-8, so about 300px from top including padding
      const speakerImageBottom = 320 // Approximate height where speaker image ends

      // Calculate fade based on how much the element overlaps with speaker image area
      if (rect.top > speakerImageBottom) {
        // Element is completely below the speaker image area - full opacity
        setOpacity(1)
      } else if (rect.bottom < speakerImageBottom) {
        // Element is completely above/behind the speaker image area - minimum opacity
        setOpacity(0.1)
      } else {
        // Element is partially overlapping - calculate gradual fade
        const visibleHeight = Math.max(0, rect.bottom - speakerImageBottom)
        const totalHeight = rect.height
        const visibilityRatio = Math.min(1, visibleHeight / totalHeight)

        // Apply easing function for smoother transition
        const easedRatio = easeOutQuad(visibilityRatio)
        const newOpacity = Math.max(0.1, easedRatio)
        setOpacity(newOpacity)
      }
    }

    // Easing function for smoother animation
    const easeOutQuad = (t: number): number => t * (2 - t)

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Call once on mount to set initial state
    handleScroll()

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div
      ref={feedRef}
      className={`transition-opacity duration-300 ease-out ${className}`}
      style={{ opacity }}
    >
      <BlueskyFeed
        blueskyHandle={blueskyHandle}
        postCount={postCount}
        compact={compact}
        className="mx-auto max-w-sm"
      />
    </div>
  )
}
