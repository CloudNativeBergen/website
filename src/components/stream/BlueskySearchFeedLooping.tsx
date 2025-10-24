'use client'

import { useMemo } from 'react'
import { BlueskyIcon } from '@/components/SocialIcons'
import type { CSSProperties } from 'react'
import { BlueskyPostItem, type BlueskyPost } from '@/components/BlueskyPostItem'

export interface BlueskySearchFeedLoopingProps {
  posts: BlueskyPost[]
  className?: string
  compact?: boolean
  title?: string
  speed?: number // Animation duration in seconds
  maxHeight?: string // Maximum height before scrolling
}

export default function BlueskySearchFeedLooping({
  posts,
  className = '',
  title = 'Social Feed',
  speed = 30,
  maxHeight = '600px',
}: BlueskySearchFeedLoopingProps) {
  const postItems = useMemo(() => {
    // Duplicate posts for seamless loop
    const duplicatedPosts = [...posts, ...posts]

    return duplicatedPosts.map((post, index) => (
      <BlueskyPostItem
        key={`${post.uri}-${index}`}
        post={post}
        variant="large"
        showBorder={index > 0}
      />
    ))
  }, [posts])

  // Empty state - show message for no recent posts
  if (posts.length === 0) {
    return (
      <section
        className={`rounded-lg border-2 border-brand-cloud-blue/20 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:bg-gray-900/95 ${className}`}
        aria-label="Bluesky social feed"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BlueskyIcon className="h-10 w-10 text-brand-cloud-blue dark:text-blue-400" />
            <h3 className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
              {title}
            </h3>
          </div>
        </div>
        <p className="py-8 text-center text-xl text-gray-500 dark:text-gray-400">
          No recent posts available. Check back soon!
        </p>
      </section>
    )
  }

  // Main render with scrolling animation
  return (
    <section
      className={`overflow-hidden rounded-lg border-2 border-brand-cloud-blue/20 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:bg-gray-900/95 ${className}`}
      aria-label="Bluesky social feed"
      style={{ maxHeight }}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BlueskyIcon className="h-10 w-10 text-brand-cloud-blue dark:text-blue-400" />
          <h3 className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            {title}
            {posts.length > 1 && (
              <span className="ml-2 text-xl text-gray-500 dark:text-gray-400">
                ({posts.length})
              </span>
            )}
          </h3>
        </div>
      </div>

      <div
        className="overflow-hidden"
        style={{ height: `calc(${maxHeight} - 120px)` }}
      >
        <div
          className="animate-vertical-scroll space-y-6"
          style={
            {
              '--scroll-speed': `${speed}s`,
            } as CSSProperties
          }
        >
          {postItems}
        </div>
      </div>

      <style jsx>{`
        @keyframes vertical-scroll {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(-50%);
          }
        }

        .animate-vertical-scroll {
          animation: vertical-scroll var(--scroll-speed, 30s) linear infinite;
        }

        .animate-vertical-scroll:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-vertical-scroll {
            animation: none;
          }
        }
      `}</style>
    </section>
  )
}
