/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// next/link → a plain anchor so the banner renders in jsdom.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { UnlistedBanner } from './UnlistedBanner'
import { ACTIVATION_CHECKLIST_HREF } from '@/lib/settings/activation'

afterEach(cleanup)

describe('UnlistedBanner', () => {
  it('announces the unlisted state', () => {
    render(<UnlistedBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/unlisted/i)
    expect(screen.getByRole('status')).toHaveTextContent(
      /not indexed by search engines/i,
    )
  })

  describe('while setup is incomplete', () => {
    it('says "Finish setup" and links to the activation checklist', () => {
      render(<UnlistedBanner readyToGoLive={false} />)
      const link = screen.getByRole('link', { name: /finish setup/i })
      expect(link).toHaveAttribute('href', ACTIVATION_CHECKLIST_HREF)
    })

    it('never offers "Go live"', () => {
      // The #839 defect: the banner sent a tenant with no topics, dates, venue
      // or logo straight to the publish switch.
      render(<UnlistedBanner readyToGoLive={false} />)
      expect(screen.queryByRole('link', { name: /go live/i })).toBeNull()
      expect(
        screen.getByRole('link', { name: /finish setup/i }),
      ).not.toHaveAttribute('href', '/admin/settings#visibility')
    })

    it('defaults to incomplete when the caller resolved nothing', () => {
      // Fail toward the checklist: an unresolved caller must not vouch for a
      // conference being ready to publish.
      render(<UnlistedBanner />)
      expect(
        screen.getByRole('link', { name: /finish setup/i }),
      ).toHaveAttribute('href', ACTIVATION_CHECKLIST_HREF)
    })
  })

  describe('once every required row but the switch is done', () => {
    it('says "Go live" and links to the visibility card', () => {
      render(<UnlistedBanner readyToGoLive />)
      const link = screen.getByRole('link', { name: /go live/i })
      expect(link).toHaveAttribute('href', '/admin/settings#visibility')
      expect(screen.queryByRole('link', { name: /finish setup/i })).toBeNull()
    })
  })

  it('honours a custom settingsHref', () => {
    render(<UnlistedBanner settingsHref="/admin/settings" />)
    expect(screen.getByRole('link', { name: /finish setup/i })).toHaveAttribute(
      'href',
      '/admin/settings',
    )
  })
})
