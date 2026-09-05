/**
 * @vitest-environment node
 *
 * `/cfp/list` — the "I'm speaking at" card must follow the speaker DOCUMENT,
 * not the JWT snapshot (#875 for `image`, #958 for `title`).
 *
 * `session.speaker` is written onto the token at sign-in and refreshed only by
 * an explicit `useSession().update()`. The session cookie is rolling, so an
 * active user never re-signs-in: a photo uploaded on the profile page (or on
 * another device) stayed stale in that token indefinitely — the reported "wait
 * several months, still the old image" — and `title`, which the token shape
 * never carried, was absent for every speaker. The page therefore re-reads both
 * fields and lets the document win.
 *
 * Asserted at the SOURCE level for the same reason as `scoping.test.ts` in this
 * directory: the page is a server component with a large dependency graph. This
 * is a tripwire against the snapshot being trusted again, not a render test —
 * which is why it only has to pin that the page ASKS for the fields and routes
 * the answers through `resolveSnapshotField`. Which value that helper picks is
 * settled behaviourally in `src/lib/speaker/utils.snapshotField.test.ts`.
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

describe('/cfp/list speaker share card fields', () => {
  it('re-reads the image with the shared coalesce read model', () => {
    expect(code).toContain('"image": coalesce(image.asset->url, imageURL)')
  })

  it('re-reads the job title the token never carries', () => {
    const projection = code.match(
      /_type == "speaker" && _id == \$id\]\[0\]\{[\s\S]*?\}/,
    )?.[0]
    expect(projection).toBeDefined()
    expect(projection).toMatch(/^\s*title,?\s*$/m)
  })

  it('does not spend an extra Sanity request on them', () => {
    // One read of the speaker doc on this page, shared with `providers`.
    expect(code.match(/_type == "speaker" && _id == \$id/g)).toHaveLength(1)
  })

  it('routes both pairs of candidates through the shared resolver', () => {
    // Order matters and is easy to get backwards, so pin both arguments: the
    // DOCUMENT first, the token snapshot second.
    const card = code.match(/const speakerWithTalks = \{[\s\S]*?\n  \}/)?.[0]
    expect(card).toBeDefined()
    expect(card).toMatch(
      /image: resolveSnapshotField\(\s*currentSpeaker\?\.image,\s*speaker\.image,?\s*\)/,
    )
    expect(card).toMatch(
      /title: resolveSnapshotField\(\s*currentSpeaker\?\.title,\s*speaker\.title,?\s*\)/,
    )
  })
})
