/**
 * @vitest-environment node
 *
 * #1148 — a co-speaker must not learn that ANOTHER speaker on the proposal
 * refused to be @-mentioned, nor the minute they asked.
 *
 * `getProposal` spreads whole speaker documents (`speakers[]-> { ..., }`) and
 * the entire proposal is handed to the client in `ProposalForm`, so a field
 * added to the speaker schema reaches every co-speaker by default. That is the
 * failure mode this file exists for: it is not a missing feature but a leak
 * that arrives silently, the moment somebody adds a field.
 *
 * The assertion is on the VALUE the query RETURNS, evaluated by `groq-js` over
 * a dataset in which the other speaker really is opted out — not on the text of
 * the projection. A text assertion passes just as well against a projection
 * that names the field and then hands it back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { getProposal } from './sanity'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** Ada and Grace share a talk. Grace has opted out of being tagged. */
const dataset: Doc[] = [
  { _id: 'org-A', _type: 'organization', name: 'A' },
  { _id: 'conf-A', _type: 'conference', organization: ref('org-A') },
  {
    _id: 'spk-ada',
    _type: 'speaker',
    name: 'Ada',
    email: 'ada@example.com',
    organizations: [ref('org-A')],
  },
  {
    _id: 'spk-grace',
    _type: 'speaker',
    name: 'Grace',
    email: 'grace@example.com',
    organizations: [ref('org-A')],
    socialTagOptOut: true,
    socialTagOptOutAt: '2026-09-22T10:30:00.000Z',
  },
  {
    _id: 'talk-1',
    _type: 'talk',
    title: 'Two speakers',
    conference: ref('conf-A'),
    speakers: [ref('spk-ada'), ref('spk-grace')],
  },
]

/** Run whatever query `getProposal` sends, for real, against the dataset. */
async function speakersSeenBy(
  opts: Parameters<typeof getProposal>[0],
): Promise<Array<Record<string, unknown>>> {
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
  await getProposal(opts)
  const [query, params] = fetchMock.mock.calls.at(-1) as [
    string,
    Record<string, unknown>,
  ]
  const result = (await (
    await evaluate(parse(query), { dataset, params })
  ).get()) as Array<Record<string, unknown>> | Record<string, unknown> | null
  const proposal = Array.isArray(result) ? result[0] : result
  return (proposal?.speakers ?? []) as Array<Record<string, unknown>>
}

beforeEach(() => vi.clearAllMocks())

describe('getProposal — the co-speaker payload (#1148)', () => {
  it('does NOT tell Ada that Grace opted out, nor when', async () => {
    const speakers = await speakersSeenBy({
      id: 'talk-1',
      speakerId: 'spk-ada',
      isOrganizer: false,
    })

    const grace = speakers.find((s) => s.name === 'Grace')
    // Vacuity guard: if the projection stopped returning co-speakers at all,
    // "the field is absent" would be true for an entirely different reason.
    expect(grace, 'Grace must still be in the payload').toBeTruthy()

    // The VALUES. The dataset really does hold `true` and a timestamp, so these
    // two lines fail the moment the projection hands either one back.
    expect(grace!.socialTagOptOut).toBeNull()
    expect(grace!.socialTagOptOutAt).toBeNull()
  })

  it('still carries the co-speaker fields the form actually renders', async () => {
    // The other half of the contract: nulling the pair must not have been done
    // by narrowing the projection until it returns nothing useful.
    const speakers = await speakersSeenBy({
      id: 'talk-1',
      speakerId: 'spk-ada',
      isOrganizer: false,
    })

    const grace = speakers.find((s) => s.name === 'Grace')!
    expect(grace._id).toBe('spk-grace')
    expect(grace.email).toBe('grace@example.com')
  })

  it('withholds them from an ORGANIZER read of the same proposal too', async () => {
    // Organizers may set the opt-out through the admin editor, which reads it
    // from `getSpeakers`/`getSpeakerAdminDetail`. This payload is the proposal
    // page, and nothing there needs it.
    const speakers = await speakersSeenBy({
      id: 'talk-1',
      speakerId: 'org-user',
      isOrganizer: true,
      organizerOrgId: 'org-A',
    })

    const grace = speakers.find((s) => s.name === 'Grace')
    expect(grace, 'Grace must still be in the payload').toBeTruthy()
    expect(grace!.socialTagOptOut).toBeNull()
    expect(grace!.socialTagOptOutAt).toBeNull()
  })
})
