/**
 * `/admin/messages/<conversationId>` MUST keep resolving.
 *
 * That path is not a UI decision — it is a string already WRITTEN into
 * production `notification` documents by `conversationEmailLinkPath()` (every
 * new-message email, both audiences) and by `conversationLinkPath()` (general
 * and sponsor threads). Seven query sites match those stored strings with
 * `link in $links`:
 *
 *   src/lib/messaging/sanity.ts:~808, ~864, ~1731, ~1738
 *   src/lib/notification/sanity.ts:~533, ~544
 *   src/lib/proposal/data/sanity.ts:~480
 *   src/lib/messaging/retention.ts:~228
 *   src/components/messaging/ConversationThread.tsx:~1114 (markReadByLink)
 *
 * Delete or retarget the route and every historical row is orphaned: the unread
 * badge can never be cleared (phantom unread) and the notification can never be
 * marked read or purged — `message_received` is the ONE type exempt from the
 * 90-day retention sweep, so a stuck row is stuck forever.
 *
 * Turning the page into a three-pane workspace changed only what the route
 * RENDERS. This test pins the parts that must not move: the route file exists,
 * it takes the id from the path, and it hands that id to the workspace.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../../..')
const ROUTE = join(ROOT, 'src/app/(admin)/admin/messages/[id]/page.tsx')
const INDEX = join(ROOT, 'src/app/(admin)/admin/messages/page.tsx')
const LINKS = join(ROOT, 'src/lib/messaging/links.ts')

const read = (p: string) => readFileSync(p, 'utf8')

describe('the /admin/messages/<id> route', () => {
  it('still exists', () => {
    expect(existsSync(ROUTE)).toBe(true)
  })

  it('renders the conversation named by the path segment', () => {
    const src = read(ROUTE)
    expect(src).toMatch(/params:\s*Promise<\{\s*id:\s*string\s*\}>/)
    expect(src).toMatch(/const\s*\{\s*id\s*\}\s*=\s*await\s+params/)
    expect(src).toContain('<MessagesWorkspace conversationId={id} />')
  })

  it('does not redirect the route away to another page', () => {
    const src = read(ROUTE)
    // The ONE redirect this route is allowed is the audience redirect for a
    // speaker who reached the admin mirror — never a redirect of the organizer
    // path itself onto /admin/proposals or a rewritten messages URL.
    const redirects = [...src.matchAll(/redirect\(([^)]*)\)/g)].map((m) => m[1])
    expect(redirects).toEqual(['`/cfp/messages/${id}`'])
  })

  it('shares the workspace with the index route, so both are one surface', () => {
    expect(read(INDEX)).toContain('<MessagesWorkspace />')
  })
})

describe('the link contract module', () => {
  it('still emits /admin/messages/<id> for organizer email links', () => {
    const src = read(LINKS)
    expect(src).toContain('`/admin/messages/${conversation._id}`')
  })

  it('still emits the proposal HUB link at the proposal page', () => {
    // Deliberately unchanged: it is the string on historical notification rows.
    // The workspace overrides the LIST ROW href locally instead (see
    // MessagesWorkspace) — it does not rewrite this contract.
    expect(read(LINKS)).toContain(
      '`/admin/proposals/${conversation.proposalId}#messages`',
    )
  })
})
