/** @vitest-environment node */
import { beforeEach, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { publishedTaskKeys } from './generation-sanity'
const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {},
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
  link: `https://example.com/tickets?utm_content=${encodeURIComponent(key)}`,
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
    variant('empty', ''),
    variant('null', 'unused', { link: null }),
    variant('wrong-protocol', 'unused', {
      link: 'javascript:?utm_content=unsafe-key',
    }),
  ]
  expect(await publishedTaskKeys('conf-A')).toEqual(
    new Set(['sponsorCard:acme:linkedin', 'sponsorCard:acme:bluesky']),
  )
  expect(await publishedTaskKeys('conf-B')).toEqual(new Set(['foreign-key']))
})
