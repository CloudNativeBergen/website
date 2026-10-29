/**
 * The schedule editor's load of track sponsors, with the GROQ executed by
 * groq-js against an in-memory dataset: the day's track must carry its
 * sponsor (or the next autosave would drop it), and the picker must offer
 * this conference's public sponsors, Track Sponsorship holders first.
 */
import { evaluate, parse } from 'groq-js'
import { getScheduleData } from '@/lib/schedule/server'

const mockGetConference = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/proposal/server', () => ({
  getProposals: () => Promise.resolve({ proposals: [], proposalsError: null }),
}))

const ref = (_ref: string) => ({ _type: 'reference', _ref })

const dataset = [
  { _id: 'conf-1', _type: 'conference' },
  { _id: 'conf-2', _type: 'conference' },
  { _id: 'partner', _type: 'sponsorTier', title: 'Partner' },
  {
    _id: 'track-addon',
    _type: 'sponsorTier',
    title: 'Track Sponsorship',
    tierType: 'addon',
  },
  {
    _id: 'lanyard-addon',
    _type: 'sponsorTier',
    title: 'Lanyard Sponsorship',
    tierType: 'addon',
  },
  { _id: 'proact', _type: 'sponsor', name: 'Proact IT Norge AS' },
  { _id: 'sopra', _type: 'sponsor', name: 'Sopra Steria' },
  { _id: 'bekk', _type: 'sponsor', name: 'Bekk' },
  { _id: 'atea', _type: 'sponsor', name: 'Atea' },
  { _id: 'aws', _type: 'sponsor', name: 'AWS' },
  { _id: 'tierless', _type: 'sponsor', name: 'Tierless' },
  { _id: 'foreign', _type: 'sponsor', name: 'Foreign' },
  ...[
    ['bekk', 'closed-won', 'partner', ['lanyard-addon']],
    ['sopra', 'closed-won', 'partner', ['track-addon']],
    ['atea', 'closed-won', 'partner', []],
    ['proact', 'closed-won', 'partner', ['track-addon']],
    ['aws', 'contacted', 'partner', ['track-addon']],
    ['tierless', 'closed-won', null, []],
  ].map(([id, status, tier, addons], i) => ({
    _id: `sfc-${i}`,
    _type: 'sponsorForConference',
    conference: ref('conf-1'),
    sponsor: ref(id as string),
    status,
    ...(tier ? { tier: ref(tier as string) } : {}),
    addons: (addons as string[]).map((a) => ({ ...ref(a), _key: a })),
  })),
  {
    _id: 'sfc-foreign',
    _type: 'sponsorForConference',
    conference: ref('conf-2'),
    sponsor: ref('foreign'),
    status: 'closed-won',
    tier: ref('partner'),
  },
  {
    _id: 'tuesday',
    _type: 'schedule',
    conference: ref('conf-1'),
    status: 'official',
    date: '2026-10-27',
    tracks: [
      {
        _key: 't1',
        trackTitle: 'Proact IT - Lillesalen',
        talks: [],
        sponsor: { ...ref('proact'), _weak: true },
      },
      { _key: 't2', trackTitle: 'Hovedsalen', talks: [] },
    ],
  },
]

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params: Record<string, unknown>) =>
    (await evaluate(parse(query), { dataset, params })).get()
  return { clientRead: { fetch }, clientReadUncached: { fetch } }
})

beforeEach(() => {
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      startDate: '2026-10-27',
      endDate: '2026-10-27',
      schedules: [],
    },
    error: null,
  })
})

describe('getScheduleData — track sponsors', () => {
  it("loads each track's sponsor with the day", async () => {
    const { officialSchedules, error } = await getScheduleData()
    expect(error).toBeUndefined()
    expect(
      officialSchedules[0].tracks.map((t) => t.sponsor?._ref ?? null),
    ).toEqual(['proact', null])
  })

  it("offers this conference's public sponsors, Track Sponsorship holders first", async () => {
    const { trackSponsorOptions } = await getScheduleData()
    expect(trackSponsorOptions).toEqual([
      { _id: 'proact', name: 'Proact IT Norge AS', trackAddon: true },
      { _id: 'sopra', name: 'Sopra Steria', trackAddon: true },
      { _id: 'atea', name: 'Atea', trackAddon: false },
      { _id: 'bekk', name: 'Bekk', trackAddon: false },
    ])
  })
})
