/**
 * @vitest-environment node
 *
 * `isOurPhotoOriginal`: the only URLs the export route fetches. One URL per
 * check, each otherwise our own original, so each refusal is that check's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sanity/client', () => ({ clientReadUncached: {} }))

import { exportEntryName, isOurPhotoOriginal } from './export'

const OURS = 'https://cdn.sanity.io/images/proj/production/abc123-800x600.jpg'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
})
afterEach(() => vi.unstubAllEnvs())

describe('isOurPhotoOriginal', () => {
  it('accepts our own project and dataset’s parameterless JPEG original', () => {
    expect(isOurPhotoOriginal(OURS)).toBe(true)
  })

  it.each([
    ['not a URL', 'cdn.sanity.io/images/proj/production/abc123-800x600.jpg'],
    ['http', OURS.replace('https:', 'http:')],
    [
      'another host',
      OURS.replace('cdn.sanity.io', 'cdn.sanity.io.evil.example'),
    ],
    ['a port', OURS.replace('cdn.sanity.io', 'cdn.sanity.io:8443')],
    ['a user name', OURS.replace('https://', 'https://user@')],
    ['a password', OURS.replace('https://', 'https://:secret@')],
    ['a query (the CDN re-encodes)', `${OURS}?w=600`],
    ['a fragment', `${OURS}#x`],
    ['another project', OURS.replace('/proj/', '/other/')],
    ['another dataset', OURS.replace('/production/', '/staging/')],
    ['a file, not an image', OURS.replace('/images/', '/files/')],
    ['not a JPEG', OURS.replace('.jpg', '.png')],
  ])('refuses %s', (_, url) => {
    expect(isOurPhotoOriginal(url)).toBe(false)
  })

  it.each([
    ['project id', 'NEXT_PUBLIC_SANITY_PROJECT_ID'],
    ['dataset', 'NEXT_PUBLIC_SANITY_DATASET'],
  ])('refuses everything without a configured %s', (_, name) => {
    vi.stubEnv(name, '')
    expect(isOurPhotoOriginal(OURS)).toBe(false)
  })
})

describe('exportEntryName', () => {
  it('names a ZIP entry after the post’s upload id', () => {
    expect(exportEntryName('wallPost-6f1c')).toBe('6f1c.jpg')
  })
})
