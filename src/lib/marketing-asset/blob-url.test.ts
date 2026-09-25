import { describe, expect, it } from 'vitest'
import {
  blobStoreHost,
  checkMarketingAssetBlobUrl,
  marketingAssetPathname,
} from './blob-url'

const HOST = 'abcstore123.public.blob.vercel-storage.com'
const ORG = 'organization-cloud-native-days'
const ok = `https://${HOST}/marketing-asset/${ORG}/1790000000000-logo-Xy12Ab.png`

describe('checkMarketingAssetBlobUrl', () => {
  it('accepts a URL on our store under our organization prefix', () => {
    expect(checkMarketingAssetBlobUrl(ok, ORG, HOST)).toEqual({
      ok: true,
      url: ok,
      filename: `marketing-asset/${ORG}/1790000000000-logo-Xy12Ab.png`,
    })
  })

  it.each([
    ['another store', ok.replace('abcstore123', 'otherstore')],
    ['a look-alike host', ok.replace(HOST, `${HOST}.evil.example`)],
    ['plain http', ok.replace('https:', 'http:')],
    ['credentials in the URL', ok.replace('https://', 'https://u:p@')],
    ['an explicit port', ok.replace(HOST, `${HOST}:8443`)],
  ])('refuses %s', (_, url) => {
    expect(checkMarketingAssetBlobUrl(url, ORG, HOST)).toEqual({
      ok: false,
      reason: 'host',
    })
  })

  it.each([
    ['another organization', ok.replace(ORG, 'kkdemo.org')],
    // Same length as ours, so only the prefix itself tells them apart.
    ['another organization of the same id length', ok.replace('days', 'daze')],
    // An org whose id is a PREFIX of ours must not reach our blobs, and ours
    // must not reach one whose id extends ours.
    [
      'an organization whose id extends ours',
      `https://${HOST}/marketing-asset/${ORG}-norway/1790000000000-a.png`,
    ],
    // The gap the old `marketing-asset-<org>-` layout had: an org whose id is
    // ours plus `-<13 digits>-…`. A Sanity id cannot hold `/`, so it ends ours.
    [
      'an organization whose id is ours plus a timestamp-shaped tail',
      `https://${HOST}/marketing-asset/${ORG}-1790000000000-x/1790000000000-a.png`,
    ],
    [
      'the old dash layout',
      `https://${HOST}/marketing-asset-${ORG}-1790000000000-a.png`,
    ],
    ['a proposal blob', `https://${HOST}/proposal-abc-1790000000000-a.pdf`],
    [
      'a nested path',
      `https://${HOST}/x/marketing-asset/${ORG}/1790000000000-a.png`,
    ],
    [
      'a deeper path under our prefix',
      `https://${HOST}/marketing-asset/${ORG}/x/1790000000000-a.png`,
    ],
    [
      'a path that climbs out',
      `https://${HOST}/marketing-asset/${ORG}/1790000000000-a/../../x.png`,
    ],
    [
      'an encoded slash',
      `https://${HOST}/marketing-asset/${ORG}/1790000000000-a%2Fb.png`,
    ],
    ['a query string', `${ok}?download=1`],
    ['a fragment', `${ok}#x`],
    [
      'no timestamp after the prefix',
      `https://${HOST}/marketing-asset/${ORG}/logo.png`,
    ],
  ])('refuses %s', (_, url) => {
    expect(checkMarketingAssetBlobUrl(url, ORG, HOST)).toEqual({
      ok: false,
      reason: 'prefix',
    })
  })

  it('refuses an organization id that is not a plain Sanity id', () => {
    // Were `kkdemo.org/sub` accepted, it would reach into the `sub` folder of
    // the organization `kkdemo.org`.
    const theirs = `https://${HOST}/marketing-asset/kkdemo.org/sub/1790000000000-a.png`
    expect(checkMarketingAssetBlobUrl(theirs, 'kkdemo.org/sub', HOST)).toEqual({
      ok: false,
      reason: 'prefix',
    })
  })

  it('refuses when the store or the organization is unknown', () => {
    expect(checkMarketingAssetBlobUrl(ok, ORG, null).ok).toBe(false)
    expect(checkMarketingAssetBlobUrl(ok, '', HOST).ok).toBe(false)
  })

  it('refuses garbage', () => {
    expect(checkMarketingAssetBlobUrl('not a url', ORG, HOST)).toEqual({
      ok: false,
      reason: 'host',
    })
  })
})

describe('marketingAssetPathname', () => {
  it('builds a pathname the check accepts, with the filename made safe', () => {
    const pathname = marketingAssetPathname(
      ORG,
      'Min Logo (final).PNG',
      1790000000000,
    )
    expect(pathname).toBe(
      `marketing-asset/${ORG}/1790000000000-min-logo-final.png`,
    )
    // Vercel Blob adds a random suffix before the extension.
    const url = `https://${HOST}/${pathname.replace('.png', '-aB3dE9.png')}`
    expect(checkMarketingAssetBlobUrl(url, ORG, HOST).ok).toBe(true)
  })
})

describe('blobStoreHost', () => {
  it('uses BLOB_STORE_ID when there is no read-write token', () => {
    expect(blobStoreHost({ BLOB_STORE_ID: 'store_AbC123' })).toBe(
      'abc123.public.blob.vercel-storage.com',
    )
  })
  it('prefers the read-write token, which is the store upload tokens are signed for', () => {
    expect(
      blobStoreHost({
        BLOB_STORE_ID: 'store_Other9',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123_secretpart',
      }),
    ).toBe('abc123.public.blob.vercel-storage.com')
  })
  it('falls back to the read-write token', () => {
    expect(
      blobStoreHost({
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123_secretpart',
      }),
    ).toBe('abc123.public.blob.vercel-storage.com')
  })
  it('is null when neither is set, or the store id is not a plain id', () => {
    expect(blobStoreHost({})).toBeNull()
    expect(blobStoreHost({ BLOB_STORE_ID: 'evil.example/x' })).toBeNull()
  })
})
