/**
 * /privacy says what happens to a workshop signup when its owner cancels.
 * Since #1331 the cancel DELETES the signup (`workshop.cancelSignup`); before,
 * it moved the signup to the waitlist, and the page said so. This pins the page
 * to the behaviour, which `__tests__/api/trpc/workshop.cancel.test.ts` proves.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const privacy = readFileSync(
  join(__dirname, '..', '..', 'src/app/(main)/privacy/page.tsx'),
  'utf8',
).replace(/\s+/g, ' ')

describe('the workshop-signup retention statement on /privacy', () => {
  it('says a cancel deletes the signup', () => {
    expect(privacy).toContain('Cancelling deletes your signup.')
  })

  it('says signups cancelled under the old behaviour are still kept', () => {
    expect(privacy).toContain(
      'Earlier, cancelling moved you to the waitlist instead; a signup cancelled that way is still kept.',
    )
  })

  it('no longer says a cancel moves you to the waitlist, as if it still did', () => {
    expect(privacy).not.toContain('Cancelling moves you to the waitlist')
  })
})
