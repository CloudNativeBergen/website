/**
 * @vitest-environment jsdom
 *
 * The root layout renders analytics on every route and cannot see the path,
 * so the attendee feedback page's exclusions live in two client components
 * (speaker feedback spec §7.1): a gate that hides Pirsch and `InstallPrompt`
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

import { HiddenOnFeedbackPage, VercelInsights } from '@/components/analytics'

afterEach(cleanup)
beforeEach(() => {
  h.pathname = '/'
  h.analyticsProps = []
  h.speedProps = []
})

describe('HiddenOnFeedbackPage', () => {
  it('renders nothing of what it wraps on the attendee page, in any case', () => {
    // `/F/K7M2QX` (caps lock) is rewritten to the page; the browser path
    // `usePathname` reports keeps the capitals.
    h.pathname = '/F/K7M2QX'
    render(
      <HiddenOnFeedbackPage>pirsch and install prompt</HiddenOnFeedbackPage>,
    )
    expect(screen.queryByText('pirsch and install prompt')).toBeNull()
    cleanup()
    h.pathname = '/f/k7m2qx'
    render(
      <HiddenOnFeedbackPage>pirsch and install prompt</HiddenOnFeedbackPage>,
    )
    expect(screen.queryByText('pirsch and install prompt')).toBeNull()
  })

  it('renders it everywhere else', () => {
    for (const path of ['/', '/faq', '/program']) {
      h.pathname = path
      render(<HiddenOnFeedbackPage>wrapped</HiddenOnFeedbackPage>)
      expect(screen.getByText('wrapped')).toBeInTheDocument()
      cleanup()
    }
  })
})

describe('VercelInsights', () => {
  it('hands both Vercel scripts a beforeSend that removes the code', () => {
    render(<VercelInsights />)

    for (const props of [h.analyticsProps[0], h.speedProps[0]]) {
      expect(props.beforeSend?.({ url: 'https://a.dev/f/k7m2qx?x=1' })).toEqual(
        { url: 'https://a.dev/f/[code]' },
      )
      expect(props.beforeSend?.({ url: 'https://a.dev/program' })).toEqual({
        url: 'https://a.dev/program',
      })
    }
  })
})
