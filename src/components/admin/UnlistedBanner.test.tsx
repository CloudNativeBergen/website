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

afterEach(cleanup)

describe('UnlistedBanner', () => {
  it('announces the unlisted state', () => {
    render(<UnlistedBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/unlisted/i)
    expect(screen.getByRole('status')).toHaveTextContent(
      /not indexed by search engines/i,
    )
  })

  it('links "Go live" to the visibility settings card by default', () => {
    render(<UnlistedBanner />)
    const link = screen.getByRole('link', { name: /go live/i })
    expect(link).toHaveAttribute('href', '/admin/settings#visibility')
  })

  it('honours a custom settingsHref', () => {
    render(<UnlistedBanner settingsHref="/admin/settings" />)
    expect(screen.getByRole('link', { name: /go live/i })).toHaveAttribute(
      'href',
      '/admin/settings',
    )
  })
})
