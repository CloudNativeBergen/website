/**
 * @vitest-environment node
 *
 * The two pieces of the workshop portal that start and end a sign-in (#1296),
 * rendered to markup.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkshopSignedOut } from './WorkshopSignedOut'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

describe('WorkshopSignedOut', () => {
  const markup = renderToStaticMarkup(
    <WorkshopSignedOut conferenceTitle="Cloud Native Days Norway 2026" />,
  )

  /** Every navigation target in the markup, in order. */
  const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)
  const forms = [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(
    ([, attributes, body]) => ({
      action: /action="([^"]*)"/.exec(attributes)?.[1],
      method: /method="([^"]*)"/.exec(attributes)?.[1],
      label: body.replace(/<[^>]+>/g, ''),
    }),
  )

  it('starts sign-in and sign-up with GET forms to the routes on THIS host', () => {
    // Forms, so the click is one real browser navigation (see the component).
    expect(forms).toEqual([
      { action: '/workshop/sign-in', method: 'get', label: 'Sign In' },
      { action: '/workshop/sign-up', method: 'get', label: 'Create Account' },
    ])
  })

  it('links to the legal pages and to nothing else', () => {
    // The WHOLE set of link targets. A hand-built `api.workos.com` authorize
    // URL, or a `next/link` to either route above, would be an extra entry.
    expect(hrefs).toEqual(['/terms', '/privacy'])
  })

  it('names the conference', () => {
    expect(markup).toContain(
      'Sign in to register for workshops at Cloud Native Days Norway 2026.',
    )
  })

  it('says nothing about a sign-in unless told one did not complete', () => {
    expect(markup).not.toContain('did not complete')
    expect(markup).not.toContain('role="status"')
  })

  it('says, in one neutral line, that sign-in did not complete, and still offers both buttons', () => {
    const after = renderToStaticMarkup(
      <WorkshopSignedOut
        conferenceTitle="Cloud Native Days Norway 2026"
        signInIncomplete
      />,
    )

    expect(
      [...after.matchAll(/<p role="status"[^>]*>([^<]*)<\/p>/g)].map(
        ([, text]) => text,
      ),
    ).toEqual(['Sign-in did not complete. Please try again.'])
    expect(after.match(/<form\b/g)).toHaveLength(2)
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
