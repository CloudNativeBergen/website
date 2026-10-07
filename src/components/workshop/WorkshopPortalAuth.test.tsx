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

  it('links to the SDK-backed sign-in and sign-up routes on THIS host', () => {
    expect(markup).toContain('href="/workshop/sign-in"')
    expect(markup).toContain('href="/workshop/sign-up"')
    expect(markup).toContain('Sign In')
    expect(markup).toContain('Create Account')
  })

  it('carries no hand-built authorize URL', () => {
    expect(markup).not.toContain('api.workos.com')
    expect(markup).not.toContain('client_id')
    expect(markup).not.toContain('redirect_uri')
  })

  it('names the conference and keeps the legal links', () => {
    expect(markup).toContain('Cloud Native Days Norway 2026')
    expect(markup).toContain('href="/terms"')
    expect(markup).toContain('href="/privacy"')
  })
})

describe('WorkshopSignOutButton', () => {
  const markup = renderToStaticMarkup(
    <WorkshopSignOutButton action={async () => {}} />,
  )

  it('is a form that POSTS — a submit button, not a link', () => {
    expect(markup).toMatch(/^<form/)
    expect(markup).toMatch(/<button[^>]*type="submit"/)
    expect(markup).toContain('Sign Out')
    expect(markup).not.toContain('<a ')
  })

  it('does not point at NextAuth’s sign-out route', () => {
    expect(markup).not.toContain('/api/auth/signout')
  })
})
