/**
 * WHICH AVATAR WINS WHEN THE TOKEN DISAGREES WITH THE DOCUMENT (#875).
 *
 * The reported bug was a share card showing a months-old photo. Nothing was
 * wrong with the stored data — the surface read `session.speaker`, a snapshot
 * written onto the JWT at sign-in, and the session cookie rolls, so an active
 * user never re-signs-in and the snapshot never refreshes.
 *
 * The page-level test for that fix is a source tripwire: it asserts the query
 * asks for the field, not that the right value comes out. These are the
 * behavioural half, and the asymmetry in the last two cases is the whole point
 * — the document wins when it has something to say, and only then.
 */
import { describe, expect, it } from 'vitest'
import { resolveSnapshotImage } from './utils'

describe('resolveSnapshotImage', () => {
  const DOC = 'https://cdn.example/uploaded.jpg'
  const TOKEN = 'https://avatars.example/oauth.jpg'

  it('prefers the document over a stale token snapshot', () => {
    // The reported bug, in one line: both exist and disagree.
    expect(resolveSnapshotImage(DOC, TOKEN)).toBe(DOC)
  })

  it('keeps the token when the document has no image', () => {
    // Not symmetric on purpose. Blanking a speaker who has only ever had an
    // OAuth avatar would trade a stale photo for no photo.
    expect(resolveSnapshotImage(null, TOKEN)).toBe(TOKEN)
    expect(resolveSnapshotImage(undefined, TOKEN)).toBe(TOKEN)
  })

  it('treats an empty document value as nothing to say', () => {
    // A blank string is what an unset Sanity field can project as, and it
    // would render as a broken image rather than fall back to initials.
    expect(resolveSnapshotImage('', TOKEN)).toBe(TOKEN)
  })

  it('reports no image when neither side has one', () => {
    // The caller renders initials from this, so absent must stay absent
    // rather than becoming an empty string that looks like a URL.
    expect(resolveSnapshotImage(null, null)).toBeNull()
    expect(resolveSnapshotImage(undefined, undefined)).toBeUndefined()
  })

  it('uses the document even when the token has nothing', () => {
    expect(resolveSnapshotImage(DOC, null)).toBe(DOC)
  })
})
