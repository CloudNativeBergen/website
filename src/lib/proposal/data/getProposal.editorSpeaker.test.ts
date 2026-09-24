/**
 * @vitest-environment node
 *
 * The proposal editor round trip: `[id]/page.tsx` seeds `ProposalForm` with
 * the caller's entry from `getProposal`'s `speakers[]` (via
 * `resolveEditorSpeaker`), and submit sends that object to `speaker.update`.
 * Whatever the projection returns must therefore parse as `SpeakerInputSchema`.
 *
 * It did not: `speakers[]-> { ..., }` spread the raw Sanity slug object
 * (`{ _type: 'slug', current }`), so every speaker with a slug got a 400
 * "expected string, received object" on submitting an edit.
 *
 * The query is evaluated by `groq-js` over a dataset holding the slug in its
 * stored shape — a projection-text assertion could not catch this.
 */
import { describe, it, expect, vi } from 'vitest'
import { parse, evaluate } from 'groq-js'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { getProposal } from './sanity'
import { resolveEditorSpeaker } from '../editorSpeaker'
import { SpeakerInputSchema } from '@/server/schemas/speaker'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

const dataset = [
  { _id: 'org-A', _type: 'organization', name: 'A' },
  { _id: 'conf-A', _type: 'conference', organization: ref('org-A') },
  {
    _id: 'spk-ada',
    _type: 'speaker',
    name: 'Ada',
    email: 'ada@example.com',
    slug: { _type: 'slug', current: 'ada-lovelace' },
    organizations: [ref('org-A')],
  },
  {
    _id: 'talk-1',
    _type: 'talk',
    title: 'Confirmed talk',
    status: 'confirmed',
    conference: ref('conf-A'),
    speakers: [ref('spk-ada')],
  },
]

describe('getProposal → proposal editor → speaker.update', () => {
  it('returns the caller as a speaker.update payload that parses', async () => {
    fetchMock.mockImplementation(
      async (query: string, params: Record<string, unknown> = {}) =>
        await (await evaluate(parse(query), { dataset, params })).get(),
    )
    const { proposal } = await getProposal({
      id: 'talk-1',
      speakerId: 'spk-ada',
      isOrganizer: false,
    })

    const editorSpeaker = resolveEditorSpeaker(
      proposal?.speakers,
      { name: 'fallback' },
      'spk-ada',
    )
    // Vacuity guard: the fallback would parse for an unrelated reason.
    expect(editorSpeaker.name).toBe('Ada')

    const parsed = SpeakerInputSchema.safeParse(editorSpeaker)
    expect(parsed.error?.issues).toBeUndefined()
    expect(parsed.data?.slug).toBe('ada-lovelace')
  })
})
