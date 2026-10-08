/**
 * @vitest-environment node
 *
 * The two pieces of the workshop portal that start and end a WorkOS session
 * (#1296), rendered to markup.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkshopSignedOut } from './WorkshopSignedOut'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

describe('WorkshopSignedOut', () => {
  const markup = renderToStaticMarkup(
    <WorkshopSignedOut conferenceTitle="Cloud Native Days Norway 2026" />,
  )

  /** Every link target in the markup, in order. */
  const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)

  it('links to the SDK-backed sign-in and sign-up routes, and to nothing off this host', () => {
    // The WHOLE set of link targets: two first-party routes that start the
    // flow through the SDK, and the two legal pages. A hand-built
    // `api.workos.com` authorize URL would be a fifth entry and fail this.
    expect(hrefs).toEqual([
      '/workshop/sign-in',
      '/workshop/sign-up',
      '/terms',
      '/privacy',
    ])
    expect(markup).toContain('Sign In')
    expect(markup).toContain('Create Account')
  })

  it('names the conference', () => {
    expect(markup).toContain(
      'Sign in to register for workshops at Cloud Native Days Norway 2026.',
    )
  })
})

describe('WorkshopSignOutButton', () => {
  const markup = renderToStaticMarkup(
    <WorkshopSignOutButton action={async () => {}} />,
  )

  it('is a form with one submit button and no link at all', () => {
    expect(markup).toMatch(/^<form/)
    expect(
      markup.match(/<button[^>]*type="submit"[^>]*>Sign Out<\/button>/),
    ).not.toBeNull()
    // Nothing navigates: the old control was an `<a href="/api/auth/signout…">`.
    expect([...markup.matchAll(/<a\b|href=/g)]).toHaveLength(0)
  })
})
