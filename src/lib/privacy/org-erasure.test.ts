import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientReadUncached } from '@/lib/sanity/client'
import { mergeKonfApiConference, rolloutFlags } from '@/lib/conference/konf-api'
import { planOrgErasure } from './org-erasure'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: {},
}))
// The real merge runs; only the gateway behind it is stubbed.
vi.mock('@/lib/conference/konf-api', () => ({
  rolloutFlags: vi.fn(),
  mergeKonfApiConference: vi.fn(),
}))
vi.mock('@/lib/workshop/central-sign-in/workos', () => ({
  workshopWorkOS: () => ({
    userManagement: { listUsers: async () => ({ data: [] }) },
  }),
}))
vi.mock('@/lib/sponsor-crm/contact-erasure', () => ({
  eraseSponsorContactSendRecords: vi.fn(async () => ({
    patches: [],
    revocations: [],
  })),
}))
vi.mock('@/lib/speaker/erasure', () => ({ eraseSpeakerInPlace: vi.fn() }))
vi.mock('@/lib/speaker/audience-erasure', () => ({
  removeFromSpeakerAudiences: vi.fn(),
}))
vi.mock('./erasure-log', () => ({ writePrivacyErasureLog: vi.fn() }))
vi.mock('@/server/tenancy', () => ({ requireSpeakerInCurrentOrg: vi.fn() }))

const fetchMock = vi.mocked(clientReadUncached.fetch) as unknown as ReturnType<
  typeof vi.fn
>
const flagsMock = vi.mocked(rolloutFlags)
const mergeMock = vi.mocked(mergeKonfApiConference)

const conf = (id: string, flagged: boolean) => ({
  _id: id,
  title: `Sanity ${id}`,
  domains: [`${flagged ? 'flagged' : 'plain'}-${id}.test`],
  organization: { _ref: 'org-a' },
})
const a = conf('conf-a', true)
const b = conf('conf-b', false)
const signups = [
  { id: 'ws-1', workshop: 'K8s', conference: a, workosId: null },
  { id: 'ws-2', workshop: 'Helm', conference: a, workosId: null },
  { id: 'ws-3', workshop: null, conference: b, workosId: null },
]

function routeFetch() {
  fetchMock.mockImplementation(async (query: string) => {
    if (query.includes('"signups"')) return { invitations: [], signups }
    if (query.startsWith('count(')) return 0
    return []
  })
}

const workshops = async () =>
  (await planOrgErasure('Ada@Example.test', 'org-a')).preview.groups.find(
    (g) => g.kind === 'workshops',
  )?.items

beforeEach(() => {
  routeFetch()
  flagsMock.mockImplementation(async (host) => ({
    apiRead: !!host?.startsWith('flagged-'),
    identityLogin: false,
    d1Write: false,
  }))
  mergeMock.mockImplementation(async (_host, c) => ({
    ...c,
    title: `D1 ${c._id}`,
  }))
})

describe('planOrgErasure workshop signups (#2011)', () => {
  it('labels with the merged title; the record set stays the GROQ ids', async () => {
    expect(await workshops()).toEqual([
      { id: 'ws-1', label: 'K8s (D1 conf-a)' },
      { id: 'ws-2', label: 'Helm (D1 conf-a)' },
      { id: 'ws-3', label: 'Workshop (Sanity conf-b)' },
    ])
  })

  it('merges once per distinct conference, not per signup', async () => {
    await workshops()
    expect(flagsMock).toHaveBeenCalledTimes(2)
    expect(mergeMock).toHaveBeenCalledTimes(1)
  })

  it('leaves an unflagged tenant identical and never calls the gateway merge', async () => {
    flagsMock.mockResolvedValue({
      apiRead: false,
      identityLogin: false,
      d1Write: false,
    })
    expect(await workshops()).toEqual([
      { id: 'ws-1', label: 'K8s (Sanity conf-a)' },
      { id: 'ws-2', label: 'Helm (Sanity conf-a)' },
      { id: 'ws-3', label: 'Workshop (Sanity conf-b)' },
    ])
    expect(mergeMock).not.toHaveBeenCalled()
  })

  it('falls back to the Sanity title when the gateway fails', async () => {
    mergeMock.mockRejectedValue(new Error('gateway down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await workshops()).toEqual([
      { id: 'ws-1', label: 'K8s (Sanity conf-a)' },
      { id: 'ws-2', label: 'Helm (Sanity conf-a)' },
      { id: 'ws-3', label: 'Workshop (Sanity conf-b)' },
    ])
  })
})
