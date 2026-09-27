/**
 * @vitest-environment node
 *
 * The track route against a two-tenant dataset, with the REAL tenancy guard
 * and the REAL reads EXECUTED by groq-js. Only the organizer check (proven in
 * `route.test.ts`), the host's conference and the network are replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  upstream: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'organizer' } }),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  }),
}))
vi.mock('@/lib/sanity/client', () => {
  const run = async (query: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(query), { dataset: h.dataset, params })).get()
  return {
    clientReadUncached: { fetch: run, withConfig: () => ({ fetch: run }) },
    clientWrite: {},
    clientRead: { fetch: run },
  }
})

import { GET } from './route'

const url = (name: string) =>
  `https://cdn.sanity.io/files/proj/production/${name}.mp3`
const file = (id: string) => ({
  _id: id,
  _type: 'sanity.fileAsset',
  url: url(id),
})
const org = (id: string) => ({ _type: 'reference', _ref: id })

beforeEach(() => {
  vi.stubGlobal('fetch', h.upstream)
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
  h.upstream.mockReset()
  h.upstream.mockImplementation(
    async () =>
      new Response('bytes', { headers: { 'content-type': 'audio/mpeg' } }),
  )
  h.dataset = [
    file('file-ours'),
    file('file-theirs'),
    file('file-held'),
    {
      _id: 'track-ours',
      _type: 'marketingAsset',
      organization: org('org-A'),
      kind: 'audio',
      audio: { asset: { _ref: 'file-ours' } },
    },
    {
      _id: 'track-theirs',
      _type: 'marketingAsset',
      organization: org('org-B'),
      kind: 'audio',
      audio: { asset: { _ref: 'file-theirs' } },
    },
    {
      _id: 'image-ours',
      _type: 'marketingAsset',
      organization: org('org-A'),
      image: { asset: { _ref: 'file-ours' } },
    },
    {
      _id: 'project-ours',
      _type: 'videoProject',
      organization: org('org-A'),
      track: { file: { asset: { _ref: 'file-held' } } },
    },
    {
      _id: 'project-theirs',
      _type: 'videoProject',
      organization: org('org-B'),
      track: { file: { asset: { _ref: 'file-theirs' } } },
    },
    {
      _id: 'project-silent',
      _type: 'videoProject',
      organization: org('org-A'),
    },
  ]
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const get = (query: string) =>
  GET(new Request(`http://localhost/api/admin/studio-track?${query}`))

describe('the track route on executed reads', () => {
  it('fetches our gallery track’s own file, and a project’s held file', async () => {
    expect((await get('asset=track-ours')).status).toBe(200)
    expect(h.upstream).toHaveBeenLastCalledWith(
      url('file-ours'),
      expect.anything(),
    )
    expect((await get('project=project-ours')).status).toBe(200)
    expect(h.upstream).toHaveBeenLastCalledWith(
      url('file-held'),
      expect.anything(),
    )
  })

  it('gives another organization’s track, an image, a missing id and a silent project one answer, fetching nothing', async () => {
    const bodies = new Set<string>()
    for (const query of [
      'asset=track-theirs',
      'project=project-theirs',
      'asset=image-ours',
      'asset=nothing-here',
      'project=project-silent',
      // A project id asked for as a gallery asset, and the other way round.
      'asset=project-ours',
      'project=track-ours',
    ]) {
      const response = await get(query)
      expect(response.status, query).toBe(404)
      bodies.add(await response.text())
    }
    expect(bodies.size).toBe(1)
    expect(h.upstream).not.toHaveBeenCalled()
  })
})
