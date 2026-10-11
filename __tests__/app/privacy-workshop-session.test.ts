/**
 * /privacy describes the workshop portal's sign-in cookies (#1311, #1316): how
 * long the session lasts, what it holds, and how long the cookies of a sign-in
 * or sign-out in progress can live. All of it comes from
 * `src/lib/workshop/central-sign-in/`, so this pins the wording to those
 * modules, from the real sources, the way the upload-retention test does.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const session = read('src/lib/workshop/central-sign-in/session.ts')
const privacy = read('src/app/(main)/privacy/page.tsx').replace(/\s+/g, ' ')

/** `const NAME = <product of integers>` in `source`, evaluated. */
function constantSeconds(source: string, name: string): number {
  const expression = source.match(
    new RegExp(`const ${name} = ([\\d\\s*]+)`),
  )?.[1]
  expect(expression, `${name} is declared`).toBeDefined()
  return expression!
    .split('*')
    .map((factor) => Number(factor.trim()))
    .reduce((product, factor) => product * factor, 1)
}

/** The lifetime the session module declares, in days. */
function sessionDays(): number {
  const seconds = constantSeconds(session, 'SESSION_TTL_SECONDS')
  expect(seconds % 86_400, 'the lifetime is whole days').toBe(0)
  return seconds / 86_400
}

/** Every field the session schema seals, read from the source. */
function sessionFields(): string[] {
  const fields = [...session.matchAll(/^\s{2}(\w+): z\./gm)].map((m) => m[1])
  // A field added to the schema without a disclosure here fails below.
  expect(fields.length).toBeGreaterThanOrEqual(7)
  return fields
}

/** The plain words /privacy uses for each sealed field, no exemptions. */
const DISCLOSED: Record<string, RegExp> = {
  userId: /WorkOS User ID/,
  email: /email address/,
  emailVerified: /whether (?:WorkOS reports that address as|it is) verified/,
  name: /your name/,
  sessionId: /WorkOS session ID/,
  host: /the site and conference it was issued for/,
  conferenceId: /site and conference it was issued for/,
}

/**
 * The two passages that describe the cookies, each as two sentences: the
 * session cookie, then the short-lived ones.
 */
function cookiePassages(): Record<string, string> {
  const dataList = privacy.match(
    /A sign-in cookie on this site, kept for \d+ days(?:[^.]*\.){2}/,
  )?.[0]
  const cookiesSection = privacy.match(
    /<strong>Workshop sign-in:<\/strong>(?:[^.]*\.){2}/,
  )?.[0]
  expect(dataList, 'the data list names the cookie').toBeDefined()
  expect(cookiesSection, 'the cookies section names the cookie').toBeDefined()
  return { dataList: dataList!, cookiesSection: cookiesSection! }
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

  it('lists what the session holds, field by field, in both passages', () => {
    const fields = sessionFields()
    for (const field of fields) {
      expect(DISCLOSED, `${field} has a disclosure`).toHaveProperty(field)
    }
    for (const [name, passage] of Object.entries(cookiePassages())) {
      for (const field of fields) {
        expect(passage, `${name} names ${field}`).toMatch(DISCLOSED[field])
      }
    }
  })

  it('bounds the short-lived cookies by the longest lifetime in the code', () => {
    const longest = Math.max(
      constantSeconds(
        read('src/lib/workshop/central-sign-in/start-seals.ts'),
        'START_TTL_SECONDS',
      ),
      constantSeconds(
        read('src/lib/workshop/central-sign-in/sign-out.ts'),
        'SIGN_OUT_RETURN_TTL_SECONDS',
      ),
    )
    const words: Record<string, number> = { five: 5, ten: 10, fifteen: 15 }
    for (const [name, passage] of Object.entries(cookiePassages())) {
      const promise = passage.match(/expire within (\w+) minutes/)
      expect(promise, `${name} bounds the short-lived cookies`).not.toBeNull()
      const minutes = words[promise![1]] ?? Number(promise![1])
      expect(minutes * 60, name).toBeGreaterThanOrEqual(longest)
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
