/**
 * /privacy describes the workshop portal's sign-in cookie (#1311, #1316): how
 * long it lasts and what it holds. Both come from
 * `src/lib/workshop/central-sign-in/session.ts`, so this pins the wording to
 * that module, from the real sources, the way the upload-retention test does.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const session = read('src/lib/workshop/central-sign-in/session.ts')
const privacy = read('src/app/(main)/privacy/page.tsx').replace(/\s+/g, ' ')

/** The lifetime the session module declares, in days. */
function sessionDays(): number {
  const expression = session.match(
    /const SESSION_TTL_SECONDS = ([\d\s*]+)/,
  )?.[1]
  expect(expression, 'the session lifetime is declared').toBeDefined()
  const seconds = expression!
    .split('*')
    .map((factor) => Number(factor.trim()))
    .reduce((product, factor) => product * factor, 1)
  expect(seconds % 86_400, 'the lifetime is whole days').toBe(0)
  return seconds / 86_400
}

describe('the workshop sign-in cookie on /privacy', () => {
  it('promises the lifetime the session module enforces, everywhere it names one', () => {
    const days = sessionDays()
    const promises = privacy.match(/(?:kept for|expires) (\d+) days/g) ?? []
    // The data list, the retention table and the cookies section each name it.
    expect(promises.length).toBeGreaterThanOrEqual(3)
    for (const promise of promises) {
      expect(Number(promise.match(/(\d+) days/)![1])).toBe(days)
    }
  })

  it('lists what the session holds, field by field', () => {
    const fields = [...session.matchAll(/^\s{2}(\w+): z\./gm)].map((m) => m[1])
    // The schema is read from the source: a field added there without a
    // disclosure here fails this test.
    expect(fields).toEqual([
      'userId',
      'email',
      'emailVerified',
      'name',
      'sessionId',
      'host',
      'conferenceId',
    ])
    const disclosed: Record<string, RegExp> = {
      userId: /WorkOS User ID/,
      email: /email address/,
      emailVerified:
        /whether (?:WorkOS reports that address as|it is) verified/,
      name: /your name/,
      sessionId: /WorkOS session ID/,
    }
    const cookieSentence = privacy.match(
      /A sign-in cookie on this site, kept for \d+ days[^<]*/,
    )?.[0]
    expect(cookieSentence, 'the data list names the cookie').toBeDefined()
    for (const field of fields) {
      // The host and the conference are not personal data; the rest must be
      // named in the sentence that describes the cookie.
      if (field === 'host' || field === 'conferenceId') continue
      expect(cookieSentence, field).toMatch(disclosed[field])
    }
  })

  it('still says the login is one account shared across the platform', () => {
    // The shared-login notice stays true under the central sign-in (#1311
    // spec §1) and is rendered where WorkOS is disclosed.
    expect(privacy).toMatch(
      /\{usesWorkOS \? <SharedWorkshopLoginNotice \/> : null\}/,
    )
    const notice = read(
      'src/components/legal/SharedWorkshopLoginNotice.tsx',
    ).replace(/\s+/g, ' ')
    expect(notice).toContain('a single account shared by all conferences')
  })

  it('names the cookie and the shared login only where WorkOS is disclosed', () => {
    // Every workshop sign-in sentence sits inside a `usesWorkOS ?` branch, so
    // a tenant without workshops is not told about a cookie it never gets.
    for (const marker of [
      'A sign-in cookie on this site',
      '<strong>Workshop sign-in:</strong>',
    ]) {
      const at = privacy.indexOf(marker)
      expect(at, marker).toBeGreaterThan(0)
      const before = privacy.slice(Math.max(0, at - 400), at)
      expect(before, `${marker} is gated`).toMatch(/\{usesWorkOS \? \(/)
    }
  })
})
