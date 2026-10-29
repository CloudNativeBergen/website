/**
 * @vitest-environment jsdom
 *
 * The root layout renders analytics on every route and cannot see the path,
 * so the attendee feedback page's exclusions live in two client components
 * (speaker feedback spec §7.1): a gate that hides `InstallPrompt`
 * on `/f/**`, and the Vercel wrapper whose `beforeSend` redacts the code.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  pathname: '/' as string | null,
  analyticsProps: [] as { beforeSend?: (e: { url: string }) => unknown }[],
  speedProps: [] as { beforeSend?: (e: { url: string }) => unknown }[],
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

afterEach(cleanup)
beforeEach(() => {
  h.pathname = '/'
  h.analyticsProps = []
  h.speedProps = []
})

describe('HiddenOnFeedbackPage', () => {
  // The gate latches per document, so every test loads a fresh module.
  async function gate() {
    vi.resetModules()
    return (await import('@/components/analytics/HiddenOnFeedbackPage'))
      .HiddenOnFeedbackPage
  }

  it('renders nothing of what it wraps on the attendee page, in any case', async () => {
    // `/F/K7M2QX` (caps lock) is rewritten to the page; the browser path
    // `usePathname` reports keeps the capitals.
    for (const path of ['/F/K7M2QX', '/f/k7m2qx']) {
      const Gate = await gate()
      h.pathname = path
      render(<Gate>install prompt</Gate>)
      expect(screen.queryByText('install prompt')).toBeNull()
      cleanup()
    }
  })

  it('renders it everywhere else', async () => {
    const Gate = await gate()
    for (const path of ['/', '/faq', '/program']) {
      h.pathname = path
      render(<Gate>wrapped</Gate>)
      expect(screen.getByText('wrapped')).toBeInTheDocument()
      cleanup()
    }
  })

  it('stays shut after a client-side navigation away from the attendee page', async () => {
    // A push-notification tap can `router.push` out of `/f/<code>`. The
    // install prompt must stay hidden for the rest of that document.
    const Gate = await gate()
    h.pathname = '/f/k7m2qx'
    const { rerender } = render(<Gate>install prompt</Gate>)
    h.pathname = '/notifications'
    rerender(<Gate>install prompt</Gate>)
    expect(screen.queryByText('install prompt')).toBeNull()
  })
})

describe('VercelInsights', () => {
  it('redacts the code from Vercel Analytics page views', () => {
    render(<VercelInsights />)
    const { beforeSend } = h.analyticsProps[0]
    expect(beforeSend?.({ url: 'https://a.dev/f/k7m2qx?x=1' })).toEqual({
      url: 'https://a.dev/f/[code]',
    })
    expect(beforeSend?.({ url: 'https://a.dev/program' })).toEqual({
      url: 'https://a.dev/program',
    })
  })

  it('sends no Speed Insights metric from the attendee page', () => {
    // Its script ignores a redacted `route` (see `dropFeedbackVitals`).
    render(<VercelInsights />)
    const { beforeSend } = h.speedProps[0]
    expect(beforeSend?.({ url: 'https://a.dev/f/%6b7m2qx' })).toBeNull()
    expect(beforeSend?.({ url: 'https://a.dev/program' })).toEqual({
      url: 'https://a.dev/program',
    })
  })
})
