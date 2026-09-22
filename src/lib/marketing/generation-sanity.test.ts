/** @vitest-environment node */
import { beforeEach, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { commitGeneratedTasks, publishedTaskKeys } from './generation-sanity'
import { emptyRecords } from './materialize'
import { shortLinkIndexTag } from '@/lib/cache/tags'
import { publishedPair } from './recipes'
const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag }))
const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const tx = {
        create: () => tx,
        patch: () => tx,
        commit: async () => ({}),
      }
      return tx
    },
  },
}))
const variant = (
  _id: string,
  key: string,
  extra: Record<string, unknown> = {},
) => ({
  _id,
  _type: 'socialPostVariant',
  conference: { _ref: 'conf-A' },
  status: 'published',
  link: `https://example.com/tickets?utm_campaign=sponsors&utm_content=${encodeURIComponent(key)}`,
  ...extra,
})
beforeEach(() => {
  h.dataset = []
})
it('recovers unique published keys from surviving live same-conference variants without Tasks', async () => {
  h.dataset = [
    variant('published-li', 'sponsorCard:acme:linkedin'),
    variant('published-bs', 'sponsorCard:acme:bluesky'),
    variant('duplicate', 'sponsorCard:acme:linkedin'),
    variant('foreign', 'foreign-key', { conference: { _ref: 'conf-B' } }),
    variant('drafts.hidden', 'draft-document-key'),
    variant('versions.release.hidden', 'version-document-key'),
    ...['draft', 'scheduled', 'publishing', 'awaiting-manual', 'failed'].map(
      (status) => variant(status, `${status}-key`, { status }),
    ),
    variant('malformed', 'unused', { link: 'not a URL?utm_content=bad-key' }),
    variant('missing', 'unused', { link: 'https://example.com/' }),
    // Not a plan post: no Campaign to belong to.
    variant('campaignless', 'unused', {
      link: 'https://example.com/?utm_content=campaignless-key',
    }),
    // The same Task key sent from a second Campaign is a second post.
    variant('other-campaign', 'unused', {
      link: 'https://example.com/?utm_campaign=custom-1&utm_content=sponsorCard%3Aacme%3Alinkedin',
    }),
    variant('empty', ''),
    variant('null', 'unused', { link: null }),
    variant('wrong-protocol', 'unused', {
      link: 'javascript:?utm_content=unsafe-key',
    }),
  ]
  expect(await publishedTaskKeys('conf-A')).toEqual(
    new Set([
      publishedPair('sponsors', 'sponsorCard:acme:linkedin'),
      publishedPair('sponsors', 'sponsorCard:acme:bluesky'),
      publishedPair('custom-1', 'sponsorCard:acme:linkedin'),
    ]),
  )
  expect(await publishedTaskKeys('conf-B')).toEqual(
    new Set([publishedPair('sponsors', 'foreign-key')]),
  )
})

it('commitGeneratedTasks expires the conference code index (short-links §2.4)', async () => {
  // Triggers and the recurring expansion create Tasks with NEW codes. Without
  // the expiry the cached membership set still says the conference holds none
  // of them and every generated short link answers the HOME PAGE.
  revalidateTag.mockClear()
  expect(
    await commitGeneratedTasks({
      conferenceId: 'conf-A',
      campaignId: 'camp-1',
      campaignRev: 'rev-1',
      records: emptyRecords(),
    }),
  ).toBe(true)
  expect(revalidateTag).toHaveBeenCalledWith(shortLinkIndexTag('conf-A'), {
    expire: 0,
  })
})
