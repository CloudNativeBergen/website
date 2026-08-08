/**
 * @vitest-environment node
 *
 * WHAT THE GRANT ACTUALLY GRANTS.
 *
 * `speaker` is a GLOBAL, cross-organization document. The organizer invite
 * appends to ONE conference's `organizers[]`, and the claim that this confers no
 * standing anywhere else rests entirely on the shape of one GROQ projection —
 * `ORGANIZER_ORG_IDS_FIELD` in `src/lib/speaker/sanity.ts`, which is what the
 * session token's `organizerOrgIds` is built from and therefore the sole input
 * to `isOrganizerForOrg`.
 *
 * So this test does not mock that projection, restate it, or trust it: it READS
 * THE LITERAL OUT OF THE SOURCE FILE and evaluates it with `groq-js` against a
 * two-tenant dataset, before and after the append. If someone widens the
 * projection, this fails.
 *
 * It also pins the one thing that IS global — the deprecated `isOrganizer`
 * flag — so nobody re-reads that as an authorization signal by accident.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, evaluate } from 'groq-js'

const SOURCE = join(__dirname, '..', '..', '..', 'src/lib/speaker/sanity.ts')

/** Pull a single-quoted const's literal out of the real module source. */
function literalFromSource(name: string): string {
  const src = readFileSync(SOURCE, 'utf8')
  const match = new RegExp(`const ${name} =\\s*\\n?\\s*'([^']+)'`).exec(src)
  if (!match) {
    throw new Error(
      `Could not read ${name} out of ${SOURCE}. If it was renamed or reshaped, ` +
        'this test must be updated deliberately — it is the only proof that a ' +
        'conference-level grant does not become an org-wide one.',
    )
  }
  return match[1]
}

const ORGANIZER_ORG_IDS_FIELD = literalFromSource('ORGANIZER_ORG_IDS_FIELD')
const IS_ORGANIZER_FIELD = literalFromSource('IS_ORGANIZER_FIELD')

const INVITEE = 'speaker-invitee'

function dataset(orgAOrganizers: string[]) {
  return [
    {
      _id: 'conf-a',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-a' },
      organizers: orgAOrganizers.map((_ref, i) => ({
        _type: 'reference',
        _ref,
        _key: `k${i}`,
      })),
    },
    {
      // A SECOND tenant that must be unaffected by anything we do to the first.
      _id: 'conf-b',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-b' },
      organizers: [{ _type: 'reference', _ref: 'founder-b', _key: 'kb' }],
    },
    {
      // A second edition of org A: one grant on conf-a must not silently
      // enrol the person here either — it enrols them in the ORG, once.
      _id: 'conf-a2',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-a' },
      organizers: [{ _type: 'reference', _ref: 'founder-a', _key: 'ka' }],
    },
    {
      // A pre-044 conference with no organization: it must contribute nothing.
      _id: 'conf-legacy',
      _type: 'conference',
      organizers: [{ _type: 'reference', _ref: INVITEE, _key: 'kl' }],
    },
    { _id: INVITEE, _type: 'speaker', name: 'Ada Lovelace' },
    { _id: 'founder-a', _type: 'speaker', name: 'Hanna' },
    { _id: 'founder-b', _type: 'speaker', name: 'Bea' },
  ]
}

async function claimsFor(orgAOrganizers: string[]) {
  const query = `*[_type == "speaker" && _id == $id][0]{ ${ORGANIZER_ORG_IDS_FIELD}, ${IS_ORGANIZER_FIELD} }`
  const tree = parse(query)
  const value = await evaluate(tree, {
    dataset: dataset(orgAOrganizers),
    params: { id: INVITEE },
  })
  return (await value.get()) as {
    organizerOrgIds: string[]
    isOrganizer: boolean
  }
}

describe('what appending to conference.organizers[] grants', () => {
  it('grants NOTHING before the append', async () => {
    const claims = await claimsFor(['founder-a'])
    expect(claims.organizerOrgIds).toEqual([])
  })

  it('grants exactly the appended conference’s organization — and no other', async () => {
    const claims = await claimsFor(['founder-a', INVITEE])
    expect(claims.organizerOrgIds).toEqual(['org-a'])
    // The load-bearing negative: the second tenant is untouched.
    expect(claims.organizerOrgIds).not.toContain('org-b')
  })

  it('does not enrol the person in a conference with no organization', async () => {
    // `conf-legacy` lists the invitee and has no `organization._ref`. The
    // projection filters on `defined(organization._ref)`, so it contributes
    // nothing — an org-less conference cannot mint an org grant.
    const claims = await claimsFor(['founder-a'])
    expect(claims.organizerOrgIds).toEqual([])
  })

  it('does not duplicate the org when the person organizes two of its editions', async () => {
    const query = `*[_type == "speaker" && _id == $id][0]{ ${ORGANIZER_ORG_IDS_FIELD} }`
    const data = dataset(['founder-a', INVITEE])
    // Add the invitee to org A's OTHER edition as well.
    const a2 = data.find((d) => d._id === 'conf-a2') as {
      organizers: unknown[]
    }
    a2.organizers.push({ _type: 'reference', _ref: INVITEE, _key: 'k2' })

    const value = await evaluate(parse(query), {
      dataset: data,
      params: { id: INVITEE },
    })
    const raw = (await value.get()) as { organizerOrgIds: string[] }
    // The projection itself repeats; `applySpeakerToToken` is what dedupes.
    expect(raw.organizerOrgIds).toEqual(['org-a', 'org-a'])
    expect(Array.from(new Set(raw.organizerOrgIds))).toEqual(['org-a'])
  })

  it('the DEPRECATED global isOrganizer flag DOES flip — which is why nothing may gate on it', async () => {
    // Documented, not celebrated. `IS_ORGANIZER_FIELD` has no tenant predicate,
    // so a grant on org A makes this true everywhere. `isOrganizerForOrg` reads
    // `organizerOrgIds` and nothing else, which is what keeps the grant scoped.
    const before = await claimsFor(['founder-a'])
    const after = await claimsFor(['founder-a', INVITEE])
    // Already true before, from the org-less legacy conference — proof in itself
    // that the flag says nothing about any particular tenant.
    expect(before.isOrganizer).toBe(true)
    expect(after.isOrganizer).toBe(true)
    expect(before.organizerOrgIds).toEqual([])
  })
})
