/**
 * @vitest-environment node
 *
 * `/cfp/list` — the "I'm speaking at" card must follow the speaker DOCUMENT,
 * not the JWT snapshot (#875).
 *
 * `session.speaker` is written onto the token at sign-in and refreshed only by
 * an explicit `useSession().update()`. The session cookie is rolling, so an
 * active user never re-signs-in and a photo uploaded on the profile page (or on
 * another device) stayed stale in that token indefinitely — the reported "wait
 * several months, still the old image". The page therefore re-reads the current
 * image and lets it win over the snapshot.
 *
 * Asserted at the SOURCE level for the same reason as `scoping.test.ts` in this
 * directory: the page is a server component with a large dependency graph. This
 * is a tripwire against the snapshot being trusted again, not a render test.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(process.cwd(), 'src/app/(cfp)/cfp/list/page.tsx'),
  'utf8',
)
/** Comments stripped, so prose describing the bug cannot satisfy an assertion. */
const code = source.replace(/^\s*\/\/.*$/gm, '')

describe('/cfp/list speaker share card image', () => {
  it('re-reads the image with the shared coalesce read model', () => {
    expect(code).toContain('"image": coalesce(image.asset->url, imageURL)')
  })

  it('does not spend an extra Sanity request on it', () => {
    // One read of the speaker doc on this page, shared with `providers`.
    expect(code.match(/_type == "speaker" && _id == \$id/g)).toHaveLength(1)
  })

  it('lets the freshly-read image override the session snapshot', () => {
    // `...speaker` (the token) must be spread BEFORE the document's image.
    const card = code.match(/const speakerWithTalks = \{[\s\S]*?\n  \}/)?.[0]
    expect(card).toBeDefined()
    expect(card).toMatch(
      /\.\.\.speaker,[\s\S]*currentSpeaker\?\.image \? \{ image: currentSpeaker\.image \}/,
    )
  })
})
