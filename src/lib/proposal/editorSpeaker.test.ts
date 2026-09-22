/**
 * @vitest-environment node
 *
 * #1148 — the proposal editor must open with the caller's OWN tag opt-out.
 *
 * This is the seam the previous tests stopped short of. They pinned the GROQ
 * projection, and the projection was right; what was wrong was the page-level
 * assembly BELOW it — `[id]/page.tsx` replaces the separately fetched
 * `currentUserSpeaker` with the matching `proposal.speakers` entry, and that
 * entry comes from a projection that deliberately withholds other people's
 * opt-out. The two facts were correct in isolation and broken together.
 */
import { describe, it, expect } from 'vitest'
import type { SpeakerInput } from '@/lib/speaker/types'
import { resolveEditorSpeaker } from './editorSpeaker'

const CURRENT_USER = {
  _id: 'spk-ada',
  name: 'Ada',
  email: 'ada@example.com',
  socialTagOptOut: true,
} as unknown as SpeakerInput

/** How the proposal payload arrives once the projection has withheld it. */
const withheld = (id: string, name: string) => ({
  _id: id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  socialTagOptOut: null,
})

describe('resolveEditorSpeaker', () => {
  it('keeps the caller’s OWN opt-out when the payload withheld it', () => {
    const resolved = resolveEditorSpeaker(
      [withheld('spk-ada', 'Ada'), withheld('spk-grace', 'Grace')],
      CURRENT_USER,
      'spk-ada',
    )

    // THE VALUE the checkbox is rendered from. `null` here is what made an
    // opted-out speaker's own control render unticked, so they could not
    // withdraw something the UI said they had not asked for.
    expect(resolved.socialTagOptOut).toBe(true)
  })

  it('takes the rest of the record from the proposal’s own entry', () => {
    const resolved = resolveEditorSpeaker(
      [{ ...withheld('spk-ada', 'Ada'), title: 'From the proposal' }],
      { ...CURRENT_USER, title: 'From the profile' } as SpeakerInput,
      'spk-ada',
    )

    // The proposal entry still wins for everything else — that is why the page
    // prefers it in the first place.
    expect(resolved.title).toBe('From the proposal')
  })

  it('prefers the LATER self read over the proposal snapshot', () => {
    // REVERSED deliberately. This used to assert the proposal's copy won, and
    // that was wrong: `[id]/page.tsx` fetches the proposal FIRST and the
    // caller's own document SECOND, so when the two disagree the proposal's
    // copy is the stale one.
    const resolved = resolveEditorSpeaker(
      [{ ...withheld('spk-ada', 'Ada'), socialTagOptOut: true }],
      { ...CURRENT_USER, socialTagOptOut: undefined } as SpeakerInput,
      'spk-ada',
    )
    expect(resolved.socialTagOptOut).toBeUndefined()
  })

  it('does not resurrect an opt-out WITHDRAWN between the two reads', () => {
    // The scenario that motivates the rule, and the reason a `??` fallback
    // cannot express it: withdrawing UNSETS the field, so the authoritative
    // later read is `undefined` — indistinguishable from "no opinion" to a
    // coalescing chain, which would then take the proposal's stale `true`.
    //
    // On the VALUE the checkbox renders from. `true` here is the editor
    // telling a speaker they are protected moments after they stopped being.
    const resolved = resolveEditorSpeaker(
      [{ ...withheld('spk-ada', 'Ada'), socialTagOptOut: true }],
      { ...CURRENT_USER, socialTagOptOut: undefined } as SpeakerInput,
      'spk-ada',
    )
    expect(resolved.socialTagOptOut).not.toBe(true)
  })

  it('still shows an opt-out MADE between the two reads', () => {
    // The mirror, so the rule is not just "always undefined": the later read
    // saying `true` must win over a proposal snapshot that predates it.
    const resolved = resolveEditorSpeaker(
      [{ ...withheld('spk-ada', 'Ada'), socialTagOptOut: null }],
      { ...CURRENT_USER, socialTagOptOut: true } as SpeakerInput,
      'spk-ada',
    )
    expect(resolved.socialTagOptOut).toBe(true)
  })

  it('reports NOT opted out when neither source says so', () => {
    const resolved = resolveEditorSpeaker(
      [withheld('spk-ada', 'Ada')],
      { ...CURRENT_USER, socialTagOptOut: undefined } as SpeakerInput,
      'spk-ada',
    )
    // Off by default, and `null` from the projection must not read as a value.
    expect(resolved.socialTagOptOut).toBeUndefined()
  })

  it('falls back to the caller’s own record when they are not on the proposal', () => {
    const resolved = resolveEditorSpeaker(
      [withheld('spk-grace', 'Grace')],
      CURRENT_USER,
      'spk-ada',
    )
    expect((resolved as { _id?: string })._id).toBe('spk-ada')
    expect(resolved.socialTagOptOut).toBe(true)
  })

  it('falls back when the proposal has no speakers array at all', () => {
    expect(
      resolveEditorSpeaker(undefined, CURRENT_USER, 'spk-ada').socialTagOptOut,
    ).toBe(true)
  })

  it('never hands back ANOTHER speaker’s record', () => {
    // The id match is the only thing standing between the editor and somebody
    // else's profile; a find() that fell through to `[0]` would be worse than
    // the bug this file is about.
    const resolved = resolveEditorSpeaker(
      [withheld('spk-grace', 'Grace')],
      CURRENT_USER,
      'spk-ada',
    )
    expect(resolved.name).toBe('Ada')
  })
})
