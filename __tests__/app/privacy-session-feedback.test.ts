/**
 * /privacy discloses Session Feedback (speaker feedback spec §8) from the
 * slice that first collects it (F1c): its own section, and its cookie in the
 * cookie inventory. "Your rights" and the cookie's delete purpose arrived
 * with Delete my answer (F2).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  SessionFeedbackCookieNote,
  SessionFeedbackPrivacy,
} from '@/components/legal'

const privacy = readFileSync(
  join(__dirname, '..', '..', 'src/app/(main)/privacy/page.tsx'),
  'utf8',
)
const text = (component: () => React.ReactElement) =>
  renderToStaticMarkup(createElement(component))
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")

describe('Session Feedback on /privacy', () => {
  it('has its section and its cookie, for every tenant', () => {
    expect(privacy).toMatch(/^\s*<SessionFeedbackPrivacy \/>$/m)
    expect(privacy).toMatch(/^\s*<SessionFeedbackCookieNote \/>$/m)
  })

  it('says what is collected, and what is not', () => {
    expect(text(SessionFeedbackPrivacy)).toContain(
      'No name, email or IP address is collected.',
    )
  })

  it('gives the cookie’s real lifetime and scope', () => {
    expect(text(SessionFeedbackPrivacy)).toContain(
      'kept for 30 days after your last answer',
    )
    expect(text(SessionFeedbackCookieNote)).toContain(
      'expires 30 days after your last answer',
    )
    expect(text(SessionFeedbackCookieNote)).toContain(
      'sent only to the feedback pages',
    )
  })

  it('names changing AND deleting your own answer as the cookie’s purposes (F2)', () => {
    for (const component of [
      SessionFeedbackPrivacy,
      SessionFeedbackCookieNote,
    ]) {
      expect(text(component)).toMatch(/change (or delete )?your own answer/)
      expect(text(component)).toMatch(/delete/)
    }
  })

  it('states your rights: self-service delete, both exceptions, then the organizers (§8, R1)', () => {
    const rights = text(SessionFeedbackPrivacy)
    expect(rights).toContain('Your rights:')
    expect(rights).toMatch(/delete your answer yourself from the same browser/)
    expect(rights).toMatch(/for 30 days after your last answer/)
    expect(rights).toMatch(/replaced that code/)
    expect(rights).toMatch(/session was withdrawn/)
    expect(rights).toMatch(
      /contact the organizers quoting the comment and they will remove it/,
    )
    // Never the false "can't be linked to you after the window" (R1).
    expect(rights).not.toMatch(/linked to you/)
  })
})
