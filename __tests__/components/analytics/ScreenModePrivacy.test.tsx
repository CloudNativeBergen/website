/**
 * @vitest-environment jsdom
 *
 * The Photo Wall's Screen Mode sends no analytics and shows no prompt (Photo
 * Wall spec §9.2, §14): a venue screen polling for days is not a visit. The
 * root layout renders the analytics on every route and cannot see the path,
 * so the exclusion is enforced in five places, each by its own mechanism —
 * the two Vercel `beforeSend`s, PostHog's excluded paths (which also keep
 * the consent bar off), and the gate around Pirsch and `InstallPrompt`.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'

const h = vi.hoisted(() => ({
  pathname: '/' as string | null,
  analyticsProps: [] as {
    beforeSend?: (e: { type: 'pageview'; url: string }) => unknown
  }[],
  speedProps: [] as {
    beforeSend?: (e: { type: string; url: string; route?: string }) => unknown
  }[],
}))

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }))
vi.mock('@vercel/analytics/react', () => ({
  Analytics: (props: (typeof h.analyticsProps)[number]) => {
    h.analyticsProps.push(props)
    return null
  },
}))
vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: (props: (typeof h.speedProps)[number]) => {
    h.speedProps.push(props)
    return null
  },
}))

import { VercelInsights } from '@/components/analytics'
import {
  ANALYTICS_CONFIG_ELEMENT_ID,
  isAnalyticsExcludedPath,
  keepAnalyticsEvent,
} from '@/lib/posthog/config'
import { initTenantAnalytics } from '@/lib/posthog/init'

const SCREEN_URLS = [
  'https://2026.example.no/wall/screen',
  'https://2026.example.no/wall/screen/',
  'https://2026.example.no/WALL/SCREEN',
  'https://2026.example.no/wall/screen?look=pinboard',
  '/wall/screen',
]
const OTHER_URLS = [
  'https://2026.example.no/wall',
  'https://2026.example.no/wall/post',
  'https://2026.example.no/wall/screens',
  'https://2026.example.no/program',
]

afterEach(cleanup)
beforeEach(() => {
  h.pathname = '/'
  h.analyticsProps = []
  h.speedProps = []
})

describe('VercelInsights on /wall/screen', () => {
  it('sends no Vercel Analytics page view from Screen Mode', () => {
    render(<VercelInsights />)
    const { beforeSend } = h.analyticsProps[0]
    for (const url of SCREEN_URLS) {
      expect(beforeSend?.({ type: 'pageview', url })).toBeNull()
    }
    for (const url of OTHER_URLS) {
      expect(beforeSend?.({ type: 'pageview', url })).toEqual({
        type: 'pageview',
        url,
      })
    }
    // The attendee page is still redacted, not dropped.
    expect(
      beforeSend?.({ type: 'pageview', url: 'https://a.dev/f/k7m2qx' }),
    ).toEqual({ type: 'pageview', url: 'https://a.dev/f/[code]' })
  })

  it('sends no Speed Insights metric from Screen Mode, by url or by route', () => {
    render(<VercelInsights />)
    const { beforeSend } = h.speedProps[0]
    for (const url of SCREEN_URLS) {
      expect(beforeSend?.({ type: 'vital', url })).toBeNull()
    }
    // A metric captured just after a client-side exit carries the next
    // page's url and this page's raw-path route.
    expect(
      beforeSend?.({
        type: 'vital',
        url: 'https://a.dev/program',
        route: '/wall/screen',
      }),
    ).toBeNull()
    for (const url of OTHER_URLS) {
      expect(beforeSend?.({ type: 'vital', url })).toEqual({
        type: 'vital',
        url,
      })
    }
  })
})

describe('PostHog on /wall/screen', () => {
  it('is an excluded path: no init, no event, no consent bar', () => {
    expect(isAnalyticsExcludedPath('/wall/screen')).toBe(true)
    expect(isAnalyticsExcludedPath('/wall/screen/')).toBe(true)
    expect(isAnalyticsExcludedPath('/WALL/SCREEN')).toBe(true)
    expect(isAnalyticsExcludedPath('/wall')).toBe(false)
    expect(isAnalyticsExcludedPath('/wall/post')).toBe(false)
    expect(isAnalyticsExcludedPath('/wall/screens')).toBe(false)
    expect(
      keepAnalyticsEvent({ properties: { $pathname: '/wall/screen' } }),
    ).toBe(false)
    expect(keepAnalyticsEvent({ properties: {} }, '/wall/screen')).toBe(false)
  })

  it('sends no request at all when the page is Screen Mode, with the real SDK', async () => {
    window.history.replaceState(null, '', '/wall/screen')
    const element = document.createElement('div')
    element.id = ANALYTICS_CONFIG_ELEMENT_ID
    element.setAttribute(
      'data-token',
      'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh',
    )
    element.setAttribute('data-conference', 'conf-1')
    document.body.appendChild(element)
    const transport = vi
      .spyOn(
        posthog as unknown as { _send_request(o: unknown): void },
        '_send_request',
      )
      .mockImplementation(() => {})
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response())
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: beacon,
    })
    const init = vi.spyOn(posthog, 'init')
    try {
      // Resolves only once a client-side navigation reaches a public route,
      // which a venue screen never makes: give it a moment, then look.
      await Promise.race([
        initTenantAnalytics(window),
        new Promise((resolve) => setTimeout(resolve, 50)),
      ])
      expect(init).not.toHaveBeenCalled()
      expect(transport).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(beacon).not.toHaveBeenCalled()
      expect(document.querySelector('script[src*="posthog"]')).toBeNull()
    } finally {
      vi.restoreAllMocks()
      element.remove()
      window.history.replaceState(null, '', '/')
    }
  })
})

describe('Pirsch and the install prompt on /wall/screen', () => {
  async function gate() {
    vi.resetModules()
    return (await import('@/components/analytics/HiddenOnFeedbackPage'))
      .HiddenOnFeedbackPage
  }

  it('renders nothing of what it wraps on Screen Mode', async () => {
    for (const path of ['/wall/screen', '/wall/screen/', '/WALL/SCREEN']) {
      const Gate = await gate()
      h.pathname = path
      render(<Gate>pirsch and install prompt</Gate>)
      expect(screen.queryByText('pirsch and install prompt')).toBeNull()
      cleanup()
    }
  })

  it('still renders it on the other wall pages', async () => {
    const Gate = await gate()
    for (const path of ['/wall', '/wall/post']) {
      h.pathname = path
      render(<Gate>wrapped</Gate>)
      expect(screen.getByText('wrapped')).toBeInTheDocument()
      cleanup()
    }
  })
})
