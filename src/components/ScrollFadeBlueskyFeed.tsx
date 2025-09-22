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

      const speakerImageBottom = 320

      if (rect.top > speakerImageBottom) {
        setOpacity(1)
      } else if (rect.bottom < speakerImageBottom) {
        setOpacity(0.1)
      } else {
        const visibleHeight = Math.max(0, rect.bottom - speakerImageBottom)
        const totalHeight = rect.height
        const visibilityRatio = Math.min(1, visibleHeight / totalHeight)

        const easedRatio = easeOutQuad(visibilityRatio)
        const newOpacity = Math.max(0.1, easedRatio)
        setOpacity(newOpacity)
      }
    }

    const easeOutQuad = (t: number): number => t * (2 - t)

    window.addEventListener('scroll', handleScroll, { passive: true })

    handleScroll()

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
