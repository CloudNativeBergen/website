/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, cleanup, screen } from '@testing-library/react'

import { ImageCarousel } from '@/components/ImageCarousel'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

/**
 * The homepage gallery band autoplays. It used to advance every 5 seconds
 * unconditionally — with `prefers-reduced-motion: reduce` set (WCAG 2.3.3) and
 * while scrolled far off screen. These tests pin the gate.
 */

const AUTO_PLAY_INTERVAL_MS = 5000

function image(id: string): GalleryImageWithSpeakers {
  return {
    _id: id,
    _rev: `rev-${id}`,
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    photographer: 'Ada Lovelace',
    date: '2026-01-01',
    location: 'Bergen',
    featured: true,
    image: {
      _type: 'image',
      asset: { _ref: `image-${id}-1200x800-jpg`, _type: 'reference' },
    },
    speakers: [],
    imageUrl: `https://cdn.sanity.io/images/p/d/${id}-1200x800.jpg`,
    imageAlt: `Photo ${id}`,
  }
}

const IMAGES = [image('a'), image('b'), image('c')]

/** Drives every observer the render created. */
let intersectionCallbacks: Array<(intersecting: boolean) => void> = []

function installIntersectionObserver() {
  class FakeIntersectionObserver {
    constructor(private callback: IntersectionObserverCallback) {
      intersectionCallbacks.push((intersecting) =>
        this.callback(
          [{ isIntersecting: intersecting } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      )
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
}

function installMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') && reducedMotion,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

function setIntersecting(intersecting: boolean) {
  act(() => {
    for (const notify of intersectionCallbacks) notify(intersecting)
  })
}

function currentSlide(): string {
  return screen.getByText(/^Image \d+ of \d+$/).textContent ?? ''
}

function advanceOneInterval() {
  act(() => {
    vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS + 1)
  })
}

beforeEach(() => {
  intersectionCallbacks = []
  vi.useFakeTimers()
  installIntersectionObserver()
  installMatchMedia(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('gallery carousel autoplay', () => {
  it('advances on screen when motion is allowed', () => {
    render(<ImageCarousel images={IMAGES} autoPlay />)
    setIntersecting(true)

    expect(currentSlide()).toBe('Image 1 of 3')
    advanceOneInterval()
    expect(currentSlide()).toBe('Image 2 of 3')
  })

  it('does not advance while scrolled out of view', () => {
    render(<ImageCarousel images={IMAGES} autoPlay />)
    setIntersecting(false)

    advanceOneInterval()
    expect(currentSlide()).toBe('Image 1 of 3')

    // …and picks straight back up when it scrolls into view.
    setIntersecting(true)
    advanceOneInterval()
    expect(currentSlide()).toBe('Image 2 of 3')
  })

  it('does not advance under prefers-reduced-motion, even on screen', () => {
    installMatchMedia(true)
    render(<ImageCarousel images={IMAGES} autoPlay />)
    setIntersecting(true)

    advanceOneInterval()
    advanceOneInterval()
    expect(currentSlide()).toBe('Image 1 of 3')
  })

  it('leaves manual navigation working under reduced motion', () => {
    installMatchMedia(true)
    render(<ImageCarousel images={IMAGES} autoPlay />)
    setIntersecting(true)

    act(() => {
      screen.getByLabelText('Next image').click()
    })
    expect(currentSlide()).toBe('Image 2 of 3')
  })

  it('never autoplays when the caller did not ask for it', () => {
    render(<ImageCarousel images={IMAGES} />)
    setIntersecting(true)

    advanceOneInterval()
    expect(currentSlide()).toBe('Image 1 of 3')
  })
})
