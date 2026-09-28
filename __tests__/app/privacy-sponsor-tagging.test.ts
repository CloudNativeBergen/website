/**
 * /privacy on tagging (#1154): posts may tag a sponsor company's Bluesky
 * account, which an ORGANIZER entered — so the promise that we only tag
 * accounts people gave us themselves must be scoped to speakers, or the page
 * contradicts itself.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const privacy = readFileSync(
  join(__dirname, '..', '..', 'src/app/(main)/privacy/page.tsx'),
  'utf8',
)
  .replace(/&apos;/g, "'")
  .replace(/\s+/g, ' ')

describe('the tagging promises on /privacy', () => {
  it('discloses sponsor company tags, entered by organizers and checked with Bluesky', () => {
    expect(privacy).toContain(
      "Posts about a sponsor may tag the company's Bluesky account. Organizers enter the company's handle and LinkedIn page",
    )
  })

  it('scopes "only accounts you gave us" to speakers', () => {
    expect(privacy).not.toContain(
      'We only ever tag accounts you gave us yourself',
    )
    expect(privacy).toContain(
      "We only ever tag a speaker's accounts that the speaker gave us themselves",
    )
  })
})
