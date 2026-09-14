import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Security regression test for issue #444 (HIGH — information disclosure).
 *
 * The speaker Sanity document carries `pushSubscriptions` (push endpoint URLs +
 * the `p256dh`/`auth` crypto keys) and `pushPreferences`. Several general
 * speaker projections use a bare `...` spread, which would otherwise copy those
 * secrets into every result that flows to organizers (`speaker.admin.search`
 * via `getSpeakers`/`getOrganizers`) and the public speakers page
 * (`getSpeakers`). Only the push server code (`src/lib/push/sanity.ts`, keyed by
 * speaker id) may read them.
 *
 * These assertions run against the actual query strings the functions send to
 * Sanity (the mock does not execute GROQ), pinning the null-override so the
 * fields can never silently reappear in a shared projection.
 */

const fetchMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    create: vi.fn(),
    patch: vi.fn(),
  },
  speakerImageUrl: vi.fn(),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('@/lib/profile/github', () => ({
  verifiedEmails: vi.fn().mockResolvedValue({ error: null, emails: [] }),
}))

import { EXCLUDE_PRIVATE_SPEAKER_FIELDS } from '@/lib/sanity/helpers'
import {
  getSpeaker,
  getSpeakers,
  getOrganizers,
  getOrganizersByConference,
} from './sanity'

/** The single query string the function under test sent to Sanity. */
function capturedQuery(): string {
  expect(fetchMock).toHaveBeenCalled()
  return String(fetchMock.mock.calls[0][0])
}

/** Every query that spreads the speaker doc must null the push secrets out. */
function expectPushFieldsExcluded(query: string) {
  expect(query).toContain('"pushSubscriptions": null')
  expect(query).toContain('"pushPreferences": null')
  // `mergedWith` rides the same fragment (#1027): every entry is a full copy of
  // a speaker record a merge deleted, so spreading it would publish one
  // person's deleted record through another person's profile.
  expect(query).toContain('"mergedWith": null')
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('private speaker field exclusion (#444, #1027)', () => {
  it('EXCLUDE_PRIVATE_SPEAKER_FIELDS nulls every private field', () => {
    expect(EXCLUDE_PRIVATE_SPEAKER_FIELDS).toContain(
      '"pushSubscriptions": null',
    )
    expect(EXCLUDE_PRIVATE_SPEAKER_FIELDS).toContain('"pushPreferences": null')
    expect(EXCLUDE_PRIVATE_SPEAKER_FIELDS).toContain('"mergedWith": null')
  })

  it('getSpeakers (public speakers page + admin.search) excludes push fields', async () => {
    await getSpeakers('conf-1')
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getOrganizers (admin.search) excludes push fields', async () => {
    await getOrganizers('org-1')
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getOrganizersByConference excludes push fields', async () => {
    await getOrganizersByConference('conf-1')
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getSpeaker (single speaker) excludes push fields', async () => {
    fetchMock.mockResolvedValue({})
    await getSpeaker('spk-1')
    expectPushFieldsExcluded(capturedQuery())
  })
})

/**
 * THE INVARIANT, HELD RATHER THAN DESCRIBED.
 *
 * The tests above run four named functions and assert the query they send. That
 * is a list, and a list only covers what somebody remembered to add to it —
 * `getProposal` in `@/lib/proposal/data/sanity.ts` spreads a speaker document
 * too and was NOT on it, so its exclusion fragment could have been deleted with
 * the suite staying green. A fifth entry would fix that one case and leave the
 * next projection just as unguarded.
 *
 * So this scans the source instead: every `...` spread at the TOP LEVEL of a
 * projection over speaker documents must carry
 * `EXCLUDE_PRIVATE_SPEAKER_FIELDS`. A new projection is caught when it is
 * written, not when somebody notices it is missing.
 *
 * Bounds, stated rather than implied:
 *  - A projection is recognised by a speaker-typed OPENER on its line —
 *    `speakers[]->`, `organizers[]->`, `_type == "speaker"` and friends. A
 *    speaker projection reached some entirely different way is not seen.
 *  - TOP LEVEL only. `attachments[]{ ..., ... }` nested inside a speaker
 *    projection spreads an attachment, not a speaker, and flagging it would
 *    fill this test with noise until somebody turned it off.
 *  - The anti-vacuity test below fails if the scan stops finding the sites we
 *    know exist, so "it matched nothing" can never read as "it passed".
 */
const SPEAKER_PROJECTION_OPENER =
  /((speaker|speakers|organizers|featuredSpeakers|untaggedSpeakers)\s*(\[[^\]]*\])?\s*->|_type == "speaker")[^\n]*\{[ \t]*$/gm

/** Index of the `}` closing the block opened at `open`. */
function closingBrace(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return i
  }
  return source.length
}

/** True when the block spreads the whole document at its own top level. */
function hasTopLevelSpread(block: string): boolean {
  let depth = 0
  for (let i = 0; i < block.length; i++) {
    const char = block[i]
    if (char === '{') depth++
    else if (char === '}') depth--
    else if (depth === 1 && block.startsWith('...', i)) {
      if (
        /[\s{,]/.test(block[i - 1] ?? '') &&
        /[\s,]/.test(block[i + 3] ?? '')
      ) {
        return true
      }
    }
  }
  return false
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(path, found)
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      found.push(path)
    }
  }
  return found
}

/** `<src-relative path>:<line>` for every speaker projection using `...`. */
function spreadingSpeakerProjections(): Array<{
  site: string
  pinned: boolean
}> {
  const root = join(__dirname, '..', '..')
  const sites: Array<{ site: string; pinned: boolean }> = []
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(SPEAKER_PROJECTION_OPENER)) {
      const open = match.index + match[0].length - 1
      const block = source.slice(open, closingBrace(source, open) + 1)
      if (!hasTopLevelSpread(block)) continue
      const line = source.slice(0, match.index).split('\n').length
      sites.push({
        site: `${relative(root, file)}:${line}`,
        pinned: block.includes('EXCLUDE_PRIVATE_SPEAKER_FIELDS'),
      })
    }
  }
  return sites
}

describe('every speaker projection that spreads the document is pinned', () => {
  const sites = spreadingSpeakerProjections()

  it('the scan finds the projections we know exist (it cannot pass vacuously)', () => {
    const paths = sites.map((s) => s.site.split(':')[0])
    // `getProposal` — the one the hardcoded list missed.
    expect(paths).toContain('lib/proposal/data/sanity.ts')
    expect(paths).toContain('lib/speaker/sanity.ts')
    expect(sites.length).toBeGreaterThanOrEqual(5)
  })

  it('none of them spreads the private fields', () => {
    expect(
      sites.filter((s) => !s.pinned).map((s) => s.site),
      'A speaker projection spreads the document without ' +
        '${EXCLUDE_PRIVATE_SPEAKER_FIELDS}. That publishes push subscription ' +
        'keys and the merge trail — a copy of a DELETED person’s record — ' +
        'through whatever surface this query feeds. Append the fragment after ' +
        'the spread.',
    ).toEqual([])
  })
})
