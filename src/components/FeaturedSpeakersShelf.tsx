'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { FeaturedSpeakerTile } from '@/components/FeaturedSpeakerTile'
import { SpeakerWithTalks } from '@/lib/speaker/types'

interface FeaturedSpeakersShelfProps {
  speakers: SpeakerWithTalks[]
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Horizontal peek-and-snap shelf of photo-forward speaker overlay tiles.
 *
 * Manual only — no auto-advance or timers. On desktop, prev/next buttons scroll
 * by roughly one tile; on touch/mobile the row is swiped. The row itself is a
 * focusable region so keyboard users can arrow-scroll it, and the whole thing
 * respects `prefers-reduced-motion`.
 */
export function FeaturedSpeakersShelf({
  speakers,
}: FeaturedSpeakersShelfProps) {
  const scrollerRef = useRef<HTMLUListElement>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    // Small epsilon to absorb sub-pixel rounding at the extremes.
    setCanScrollPrev(scrollLeft > 4)
    setCanScrollNext(scrollLeft + clientWidth < scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [updateScrollState])

  const scrollByTile = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    // Advance by the width of the first tile (plus gap) so we move ~one card.
    const firstTile = el.querySelector<HTMLElement>('[data-shelf-item]')
    const step = firstTile ? firstTile.offsetWidth + 16 : el.clientWidth * 0.8
    el.scrollBy({
      left: direction * step,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  return (
    <div
      className="relative mt-12"
      role="region"
      aria-label="Featured speakers"
    >
      {/* Desktop prev/next controls (hidden on mobile — touch swipe there). */}
      <div className="pointer-events-none absolute -top-16 right-0 hidden gap-2 lg:flex">
        <button
          type="button"
          aria-label="Previous speakers"
          onClick={() => scrollByTile(-1)}
          disabled={!canScrollPrev}
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-brand-frosted-steel bg-white text-brand-slate-gray shadow-xs transition hover:border-brand-cloud-blue hover:text-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-brand-frosted-steel disabled:hover:text-brand-slate-gray dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Next speakers"
          onClick={() => scrollByTile(1)}
          disabled={!canScrollNext}
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-brand-frosted-steel bg-white text-brand-slate-gray shadow-xs transition hover:border-brand-cloud-blue hover:text-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-brand-frosted-steel disabled:hover:text-brand-slate-gray dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>

      {/* Keep the <ul> a real list (no role override) so AT announces
          "list, N items". The region role/label lives on the wrapper above;
          tabIndex keeps the row keyboard-scrollable. */}
      <ul
        ref={scrollerRef}
        tabIndex={0}
        aria-label="Featured speakers"
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-offset-2 motion-safe:scroll-smooth"
      >
        {speakers.map((speaker) => (
          <li
            key={speaker._id}
            data-shelf-item
            className="shrink-0 basis-[62%] snap-start sm:basis-[42%] lg:basis-[30%]"
          >
            <FeaturedSpeakerTile speaker={speaker} />
          </li>
        ))}

        {/* Endcap: link to the full speaker listing. */}
        <li
          data-shelf-item
          className="shrink-0 basis-[62%] snap-start sm:basis-[42%] lg:basis-[30%]"
        >
          <Link
            href="/speaker"
            className="group flex aspect-[4/5] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-frosted-steel text-brand-slate-gray transition hover:border-brand-cloud-blue hover:text-brand-cloud-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:border-gray-700 dark:text-gray-300"
          >
            <span className="font-space-grotesk text-lg font-bold">
              View all speakers
            </span>
            <ArrowRightIcon className="mt-2 size-6 transition-transform group-hover:translate-x-1" />
          </Link>
        </li>
      </ul>
    </div>
  )
}
