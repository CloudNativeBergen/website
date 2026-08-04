/**
 * @vitest-environment node
 *
 * THE SPEAKER-REFERENCE WRITE SET IS PINNED HERE (#730/#731).
 *
 * `requireSpeakerInCurrentOrg` treats PARTICIPATION — having a talk at one of
 * this org's conferences — as ownership over a person: their name, slug, bio,
 * email and GDPR consent record. That is sound only while participation cannot
 * be MANUFACTURED, i.e. while every write that puts a client-supplied speaker id
 * into a reference field goes through `requireSpeakersInCurrentOrg` first.
 *
 * `tenancy.ts`'s docstring asserts that invariant and cited this file as its CI
 * defence while the file did not exist. It does now. Nothing else in the suite
 * notices a NEW `speakers[]` writer appearing: `tenancy.writes.test.ts`'s
 * "guarded mutation surface is pinned" covers mutation PATHS for three routers
 * only, and a mutation score cannot see code nobody has written yet.
 *
 * Two pins, deliberately source-level. They are not trying to prove the guards
 * WORK — `tenancy.writes*.test.ts` does that. They fail when someone adds a
 * reference write, or deletes a guard, without thinking about tenancy at all,
 * which is exactly how the original hole shipped.
 *
 *   1. GUARD SITES — the exact set of files calling `requireSpeakersInCurrentOrg`.
 *   2. CONSTRUCTION SITES — the exact set of files that build a speaker
 *      reference array, each mapped to the guarded entry point covering it.
 *
 * `src/lib/speaker/merge.ts` is intentionally in neither: it REPOINTS existing
 * references generically (`{ ...value, _ref: survivorId }`) rather than naming
 * these fields, and both of its ids are proved by `requireSpeakerInCurrentOrg`
 * in `speaker.admin.merge` before it runs.
 *
 * WHEN THIS FAILS: decide which case you are in, then update the table.
 *   - A new write of CLIENT-SUPPLIED ids → call the guard, then add the row.
 *   - A new write of the caller's OWN id → add the row with `via: 'self'`.
 *   - Anything else → fix the code, not the table.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Repo root — this file is `src/server/tenancy.speakerRefs.test.ts`. */
const ROOT = join(__dirname, '..', '..')

/** Trees that can reach Sanity with a caller's payload. */
const SCAN_ROOTS = ['src/server', 'src/app', 'src/lib']

/**
 * The reference arrays whose contents grant standing. `talk.speakers[]` is the
 * dangerous one — it is what `speakerParticipationOrgIds` reads — but the other
 * three publish a person on a tenant's surface and are guarded the same way.
 */
const SPEAKER_REF_FIELDS = ['speakers', 'organizers', 'featuredSpeakers']

/**
 * Evidence that the value being assigned is a REFERENCE being CONSTRUCTED, not
 * a projection being read or a prop being passed. Kept to the repo's actual
 * reference builders so the scan stays low-noise.
 */
const REFERENCE_VALUE =
  /(createReference|createReferenceWithKey|prepareReferenceArray|speakerRefs|_type:\s*['"]reference['"])/

/**
 * A Sanity write verb. A file must contain one, or a field assignment in a pure
 * type/prop module would be swept in.
 */
const WRITE_VERB =
  /(clientWrite\s*\.\s*(patch|create|createOrReplace|transaction|delete)|\.\s*(set|setIfMissing|append|insert|unset)\s*\()/

/** How many lines below the field name the constructed value may appear. */
const VALUE_WINDOW = 5

/** Files that construct a speaker-reference array, and what makes each safe. */
const CONSTRUCTION_SITES: Record<string, string> = {
  'src/server/routers/proposal.ts':
    'admin.create / admin.update guard client-supplied speakers[] with requireSpeakersInCurrentOrg; the speaker-facing create writes ctx.speaker._id only',
  'src/server/routers/conference.ts':
    'updateOrganizers guards organizers[] — the ONE site allowed the wider organizer-standing set, safe because organizers[] does not feed participation',
  'src/lib/gallery/sanity.ts':
    'persistence for gallery.admin.update and the admin gallery upload route; both guard speakers[] before calling in',
  'src/lib/featured/sanity.ts':
    'persistence for featured.admin.addSpeaker, which guards the id before calling in',
}

/** Files allowed to call the guard. Exact — a deletion here fails the test. */
const GUARD_SITES = [
  'src/app/api/admin/gallery/upload/route.ts',
  'src/server/routers/conference.ts',
  'src/server/routers/featured.ts',
  'src/server/routers/gallery.ts',
  'src/server/routers/proposal.ts',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.(test|spec|stories)\./.test(entry)
    ) {
      out.push(full)
    }
  }
  return out
}

function sourceFiles(): { rel: string; source: string }[] {
  const files: { rel: string; source: string }[] = []
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      files.push({
        rel: relative(ROOT, file).split(sep).join('/'),
        source: readFileSync(file, 'utf8'),
      })
    }
  }
  return files
}

const FILES = sourceFiles()

function findConstructionSites(): string[] {
  const hits = new Set<string>()
  for (const { rel, source } of FILES) {
    if (!WRITE_VERB.test(source)) continue
    const lines = source.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const named = SPEAKER_REF_FIELDS.some((field) =>
        new RegExp(`(^|[^A-Za-z_])${field}\\s*:`).test(lines[i]),
      )
      if (!named) continue
      if (REFERENCE_VALUE.test(lines.slice(i, i + VALUE_WINDOW).join('\n'))) {
        hits.add(rel)
        break
      }
    }
  }
  return [...hits].sort()
}

function findGuardSites(): string[] {
  return FILES.filter(
    // `tenancy.ts` DEFINES the guard; it is not a call site.
    ({ rel, source }) =>
      rel !== 'src/server/tenancy.ts' &&
      source.includes('requireSpeakersInCurrentOrg('),
  )
    .map(({ rel }) => rel)
    .sort()
}

describe('the speaker-reference construction set is pinned', () => {
  const sites = findConstructionSites()

  it('the scan still finds the known writes (it cannot pass vacuously)', () => {
    expect(sites).toContain('src/server/routers/proposal.ts')
    expect(sites).toContain('src/server/routers/conference.ts')
    expect(sites).toContain('src/lib/gallery/sanity.ts')
    expect(sites.length).toBeGreaterThanOrEqual(4)
  })

  it('contains no file that has not been reviewed for tenancy', () => {
    const unreviewed = sites.filter((f) => !(f in CONSTRUCTION_SITES))
    expect(
      unreviewed,
      'A new speaker-reference write appeared. It must be preceded by ' +
        'requireSpeakersInCurrentOrg on the client-supplied ids, and then ' +
        'recorded in CONSTRUCTION_SITES in this file. See the header.',
    ).toEqual([])
  })

  it('has no stale rows', () => {
    const stale = Object.keys(CONSTRUCTION_SITES).filter(
      (f) => !sites.includes(f),
    )
    expect(
      stale,
      'These files no longer construct a speaker reference — drop the row ' +
        'rather than leaving a pin that defends nothing.',
    ).toEqual([])
  })
})

describe('the guard call sites are pinned', () => {
  it('is exactly the reviewed set', () => {
    // Both directions matter: a REMOVED guard is the regression this whole PR
    // is about, and an ADDED one means a new client-supplied-reference write
    // that has not been through review.
    expect(findGuardSites()).toEqual([...GUARD_SITES].sort())
  })
})

describe('the participation-creating write may not use organizer standing', () => {
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
  const tenancy = read('src/server/tenancy.ts')

  it('the wider organizer-standing set is opt-in, not the default', () => {
    // If this ever defaults on, `talk.speakers[]` silently regains the organizer
    // arm: reference someone into your own talk, and one call later you own
    // their profile, slug and consent record.
    expect(tenancy).toContain('includeOrganizerStanding?: boolean')
    expect(tenancy).toMatch(/opts\.includeOrganizerStanding/)
  })

  it('only conference.updateOrganizers opts in', () => {
    const optedIn = FILES.filter(({ rel, source }) => {
      if (rel === 'src/server/tenancy.ts') return false
      return source.includes('includeOrganizerStanding')
    }).map(({ rel }) => rel)
    expect(optedIn).toEqual(['src/server/routers/conference.ts'])
    expect(read('src/server/routers/conference.ts')).toContain(
      'includeOrganizerStanding: true',
    )
    // The talk path — the field participation is DERIVED from — must not.
    expect(read('src/server/routers/proposal.ts')).not.toContain(
      'includeOrganizerStanding',
    )
  })
})
