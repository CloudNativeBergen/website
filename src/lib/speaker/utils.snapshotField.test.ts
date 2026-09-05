/**
 * WHICH VALUE WINS WHEN THE TOKEN DISAGREES WITH THE DOCUMENT (#875, #958).
 *
 * Two reports, one resolver. The avatar bug (#875) was a share card showing a
 * months-old photo: nothing was wrong with the stored data — the surface read
 * `session.speaker`, a snapshot written onto the JWT at sign-in, and the session
 * cookie rolls, so an active user never re-signs-in and the snapshot never
 * refreshes. The job-title bug (#958) is the harsher case: the snapshot never
 * carries `title` at all, so the field was absent for every speaker rather than
 * merely stale.
 *
 * The page-level test for both is a source tripwire: it asserts the query asks
 * for the fields, not that the right value comes out. These are the behavioural
 * half, and the asymmetry in the fallback cases is the whole point — the
 * document wins when it has something to say, and only then.
 */
import { describe, expect, it } from 'vitest'
import { resolveSnapshotField } from './utils'

describe('resolveSnapshotField', () => {
  const DOC = 'https://cdn.example/uploaded.jpg'
  const TOKEN = 'https://avatars.example/oauth.jpg'

  it('prefers the document over a stale token snapshot', () => {
    // The reported bug, in one line: both exist and disagree.
    expect(resolveSnapshotField(DOC, TOKEN)).toBe(DOC)
  })

  it('keeps the token when the document has nothing', () => {
    // Not symmetric on purpose. Blanking a speaker who has only ever had an
    // OAuth avatar would trade a stale photo for no photo.
    expect(resolveSnapshotField(null, TOKEN)).toBe(TOKEN)
    expect(resolveSnapshotField(undefined, TOKEN)).toBe(TOKEN)
  })

  it('treats an empty document value as nothing to say', () => {
    // A blank string is what an unset Sanity field can project as, and for an
    // image it would render as a broken image rather than fall back to
    // initials.
    expect(resolveSnapshotField('', TOKEN)).toBe(TOKEN)
  })

  it('reports nothing when neither side has a value', () => {
    // The caller renders initials from an absent image, so absent must stay
    // absent rather than becoming an empty string that looks like a URL.
    expect(resolveSnapshotField(null, null)).toBeNull()
    expect(resolveSnapshotField(undefined, undefined)).toBeUndefined()
  })

  it('uses the document even when the token has nothing', () => {
    expect(resolveSnapshotField(DOC, null)).toBe(DOC)
  })

  describe('job title (#958)', () => {
    const DOC_TITLE = 'Principal Platform Engineer'
    // The shape the token actually has: `applySpeakerToToken` writes a fixed
    // field list that has never included `title`.
    const NO_TITLE_IN_TOKEN = undefined

    it('surfaces the document title the snapshot never carried', () => {
      expect(resolveSnapshotField(DOC_TITLE, NO_TITLE_IN_TOKEN)).toBe(DOC_TITLE)
    })

    it('renders no title when the speaker has not set one', () => {
      // The card hides the line entirely on a falsy title, so this must not
      // become an empty string that reserves layout space. Both an unset and a
      // null document field fall through to the (absent) snapshot value.
      expect(resolveSnapshotField(undefined, NO_TITLE_IN_TOKEN)).toBeUndefined()
      expect(resolveSnapshotField(null, NO_TITLE_IN_TOKEN)).toBeUndefined()
    })

    it('does not blank a title the snapshot somehow has', () => {
      // Guards the day a future token shape starts carrying `title`: a speaker
      // whose document field is empty keeps the snapshot value instead of
      // losing the line.
      expect(resolveSnapshotField(null, 'Staff Engineer')).toBe(
        'Staff Engineer',
      )
    })
  })
})
