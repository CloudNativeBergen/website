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

  it('discloses the Keep mark: which organizer kept a flagged comment, and when', () => {
    expect(text(SessionFeedbackPrivacy)).toContain(
      'When an organizer keeps a flagged comment, we record on the answer which organizer did so and when',
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

  it('says what a speaker’s flag records and who learns of it (F7, §11.2)', () => {
    const copy = text(SessionFeedbackPrivacy)
    expect(copy).toMatch(/flag a comment for the organizers/)
    expect(copy).toMatch(/record when it was flagged \(not by whom\)/)
    expect(copy).toMatch(
      /never the\s+comment; the one in the app is deleted after 90 days/,
    )
    // Push is sent too (whether it should be is open on #1469), and its
    // payload is the title and message only: the session, never the
    // flagging speaker, who is named in the app alone.
    expect(copy).toMatch(
      /in the app naming the session and the speaker who flagged it/,
    )
    expect(copy).toMatch(/push notification naming only the session/)
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

  it('states the retention: the 24-month fold, and earlier when every speaker of the session is erased (§12.2, §12.3)', () => {
    const copy = text(SessionFeedbackPrivacy)
    expect(copy).toMatch(
      /24 months after the conference ends; then comments and individual answers are deleted and only per-session totals remain/,
    )
    expect(copy).toMatch(
      /If every speaker of a session has their personal data erased, this happens then/,
    )
    // Never an unqualified promise: a held or moved session can outlive it.
    // A session waiting on a site update is deleted later by itself; one
    // moved to another conference keeps its earlier answers until asked.
    expect(copy).toMatch(
      /waiting on a scheduled site update, this happens once that update is published/,
    )
    expect(copy).toMatch(
      /moved to another conference, the answers it got before the move are only deleted on request: ask the organizers/,
    )
  })
})
