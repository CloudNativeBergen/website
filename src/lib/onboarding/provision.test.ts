/**
 * @vitest-environment node
 *
 * THE TENANT'S ADDRESSES — provisioning mints the pair
 * `<org-slug>.<suffix>` + `<org-slug>-<year>.<suffix>`, claims both in the
 * atomic transaction, and ALLOCATES both to the new conference.
 *
 * Every assertion here is on OBSERVABLE STATE in an in-memory content lake:
 * which documents exist, what `conference.domains[]` contains, and what the
 * `domainVerification` document says (`method`, `status`, and WHICH conference
 * it references). Deliberately NOT on error messages — a message assertion
 * passes happily against code that wrote a broken tenant anyway, which is the
 * exact failure mode this file exists to catch.
 *
 * The domain-verification stack is REAL here (only the Sanity client is faked),
 * so the allocation is exercised end to end rather than through a spy: a stub
 * would let "we called sync with a flag" stand in for "a platform-owned record
 * exists naming this conference", and those are not the same claim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

interface Doc extends Record<string, unknown> {
  _id: string
  _type: string
}

const docs = new Map<string, Doc>()

function conflict(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 409 })
}

function insertDoc(doc: Doc): void {
  if (docs.has(doc._id)) throw conflict(`Document ${doc._id} already exists`)
  docs.set(doc._id, { ...doc })
}

/** The `domainVerification` PROJECTION, mirrored (see `domain-verification/sanity.ts`). */
function projectVerification(doc: Doc) {
  return {
    _id: doc._id,
    hostname: doc.hostname,
    conferenceId: (doc.conference as { _ref?: string } | undefined)?._ref,
    token: doc.token,
    status: doc.status ?? 'pending',
    method: doc.method ?? 'dns-txt',
    graceUntil: doc.graceUntil ?? null,
    verifiedAt: doc.verifiedAt ?? null,
    lastSuccessAt: doc.lastSuccessAt ?? null,
    lastCheckedAt: doc.lastCheckedAt ?? null,
    firstFailureAt: doc.firstFailureAt ?? null,
    consecutiveFailures: doc.consecutiveFailures ?? 0,
    consecutiveSoftFailures: doc.consecutiveSoftFailures ?? 0,
    lastError: doc.lastError ?? null,
  }
}

const fetchMock = vi.fn(
  async (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('_type == "domainVerification"')) {
      const doc = docs.get(params.id as string)
      return doc ? projectVerification(doc) : null
    }
    // Provisioning receipt, addressed by deterministic id.
    if (query.includes('_type == $type && _id == $id')) {
      const doc = docs.get(params.id as string)
      return doc && doc._type === params.type ? { ...doc } : null
    }
    if (query.includes('count(*[_type == "organization"')) {
      return [...docs.values()].filter(
        (d) =>
          d._type === 'organization' &&
          (d.slug as { current?: string } | undefined)?.current === params.slug,
      ).length
    }
    // The real GROQ only pre-narrows; the JS overlap predicate is the
    // authority, so returning every claimed entry is faithful.
    if (query.includes('.domains[]')) {
      return [...docs.values()]
        .filter((d) => d._type === 'conference')
        .flatMap((d) => (d.domains as string[] | undefined) ?? [])
    }
    if (query.includes('_type == "speaker"')) {
      return [...docs.values()]
        .filter(
          (d) =>
            d._type === 'speaker' &&
            String(d.email ?? '').toLowerCase() === params.email,
        )
        .map((d) => ({ _id: d._id, name: d.name }))
    }
    throw new Error(`Unexpected query: ${query}`)
  },
)

/** Standalone patch builder — `ensureDomainVerification`'s upgrade/reset path. */
function standalonePatch(id: string) {
  let updates: Record<string, unknown> = {}
  let removals: string[] = []
  const chain = {
    set(values: Record<string, unknown>) {
      updates = { ...updates, ...values }
      return chain
    },
    unset(fields: string[]) {
      removals = [...removals, ...fields]
      return chain
    },
    async commit() {
      const doc = docs.get(id)
      if (!doc) throw conflict(`Document ${id} is gone`)
      const next = { ...doc, ...updates }
      for (const field of removals) delete next[field]
      docs.set(id, next as Doc)
    },
  }
  return chain
}

function transactionPatch(id: string) {
  const ops: Array<(doc: Doc) => Doc> = []
  const builder = {
    setIfMissing(values: Record<string, unknown>) {
      ops.push((doc) => ({ ...values, ...doc }))
      return builder
    },
    insert(_pos: string, _selector: string, items: unknown[]) {
      ops.push((doc) => ({
        ...doc,
        organizations: [
          ...((doc.organizations as unknown[] | undefined) ?? []),
          ...items,
        ],
      }))
      return builder
    },
  }
  return {
    builder,
    apply() {
      const doc = docs.get(id)
      if (!doc) throw conflict(`Document ${id} is gone`)
      docs.set(
        id,
        ops.reduce((acc, op) => op(acc), doc as Doc),
      )
    },
  }
}

/** Every document handed to `tx.create` — i.e. what rode the transaction. */
let createdInTransaction: Doc[] = []
/** Fault injection for the all-or-nothing rollback. */
let failCommit = false

function makeTransaction() {
  const staged: Array<() => void> = []
  const tx = {
    create(doc: Doc) {
      createdInTransaction.push(doc)
      staged.push(() => insertDoc(doc))
      return tx
    },
    patch(id: string, fn: (p: unknown) => unknown) {
      const rec = transactionPatch(id)
      fn(rec.builder)
      staged.push(() => rec.apply())
      return tx
    },
    async commit() {
      if (failCommit) throw new Error('sanity unavailable')
      // ALL-OR-NOTHING: snapshot, apply, restore on any failure.
      const snapshot = new Map(docs)
      try {
        for (const op of staged) op()
      } catch (error) {
        docs.clear()
        for (const [id, doc] of snapshot) docs.set(id, doc)
        throw error
      }
      return {}
    },
  }
  return tx
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params ?? {}),
  },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    transaction: () => makeTransaction(),
    create: async (doc: Doc) => {
      insertDoc(doc)
      return doc
    },
    createIfNotExists: async (doc: Doc) => {
      if (!docs.has(doc._id)) docs.set(doc._id, { ...doc })
      return doc
    },
    patch: (id: string) => standalonePatch(id),
    delete: async () => ({ results: [] }),
  },
}))

import { provisionOrganization } from './provision'
import type { OnboardingInput } from './create'

const SUFFIX = 'konf.run'
const SLUG = 'cloud-native-oslo'
/** The SHORT address of the org's latest edition. */
const BARE = `${SLUG}.${SUFFIX}`
/** This edition's PERMANENT address. */
const DATED = `${SLUG}-2027.${SUFFIX}`
/** Both, in `domains[]` order. */
const MINTED = [BARE, DATED]

function input(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    organization: {
      name: 'Cloud Native Oslo',
      slug: SLUG,
      contactEmail: 'hello@cno.no',
    },
    conference: {
      title: 'Cloud Native Days Oslo 2027',
      city: 'Oslo',
      country: 'Norway',
      startDate: '2027-06-01',
      endDate: '2027-06-02',
    },
    organizer: { name: 'Kari Nordmann', email: 'kari@cno.no' },
    domains: [],
    ...overrides,
  }
}

/** The same tenant with no dates yet — `startDate` is optional at provisioning. */
function undated(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  const base = input(overrides)
  return {
    ...base,
    conference: {
      title: base.conference.title,
      city: base.conference.city,
      country: base.conference.country,
    },
  }
}

const ofType = (type: string) =>
  [...docs.values()].filter((d) => d._type === type)

/** The verification document for a hostname, straight out of the fake lake. */
function verificationFor(hostname: string): Doc | undefined {
  return ofType('domainVerification').find((d) => d.hostname === hostname)
}

/** The one conference document — the thing a tenant is reachable through. */
function theConference(): Doc {
  const conferences = ofType('conference')
  expect(conferences).toHaveLength(1)
  return conferences[0]
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  docs.clear()
  createdInTransaction = []
  failCommit = false
  process.env.AUTH_SECRET = 'test-auth-secret'
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', SUFFIX)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  errorSpy.mockRestore()
})

// ───────────────────────────────────────────────────────────────────────────
// 1. THE TENANT COMES OUT REACHABLE
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning mints the tenant an address', () => {
  it('claims BOTH minted hosts for a tenant that asked for no domain', async () => {
    const outcome = await provisionOrganization(input())

    expect(outcome.ok).toBe(true)
    // THE assertion the bug is about: resolution is by request Host against
    // `domains[]`, so an empty list is a tenant nothing serves.
    expect(theConference().domains).toEqual(MINTED)
  })

  it('ALLOCATES EACH minted host to THAT conference (platform-owned, verified)', async () => {
    const outcome = await provisionOrganization(input())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    for (const host of MINTED) {
      const record = verificationFor(host)
      // Without a record the host fails closed everywhere — unrouted under
      // enforcement, never on the redirect allowlist. Claiming is not enough.
      expect(record).toBeDefined()
      expect(record).toMatchObject({
        hostname: host,
        method: 'platform-owned',
        status: 'verified',
        // …and allocated to THIS conference. A record naming any other
        // document is the #778 cross-tenant hijack, not a grant to this tenant.
        conference: { _ref: outcome.conferenceId },
      })
      expect(record).not.toHaveProperty('graceUntil')
    }
  })

  it('stages the claim INSIDE the transaction, not as a follow-up write', async () => {
    await provisionOrganization(input())

    // The conference document as it was HANDED TO THE TRANSACTION already
    // carries the host. A post-commit patch would produce the same final state
    // but leave a window in which the tenant exists at no address — exactly the
    // half-built state the all-or-nothing transaction exists to prevent.
    const staged = createdInTransaction.find((d) => d._type === 'conference')
    expect(staged?.domains).toEqual(MINTED)
  })

  it('leaves NO claim and NO allocation behind when the transaction fails', async () => {
    failCommit = true
    const outcome = await provisionOrganization(input())

    expect(outcome.ok).toBe(false)
    expect(ofType('organization')).toHaveLength(0)
    expect(ofType('conference')).toHaveLength(0)
    // The allocation is a GLOBAL, permanent grant — minting one for a tenant
    // that was never created would burn the hostname for good.
    expect(ofType('domainVerification')).toHaveLength(0)
  })

  it('is reachable and allocated on the SECOND front door too (same transaction, replayed)', async () => {
    const first = await provisionOrganization(input(), {
      idempotencyKey: 'idem-0123456789abcdef',
    })
    const second = await provisionOrganization(input(), {
      idempotencyKey: 'idem-0123456789abcdef',
    })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    // ONE tenant, and the replay names it.
    expect(ofType('organization')).toHaveLength(1)
    expect(second.conferenceId).toBe(first.conferenceId)
    expect(second.replayed).toBe(true)
    // The receipt carried the MINTED host, so the replay re-mints the same
    // allocation rather than an empty list.
    expect(theConference().domains).toEqual(MINTED)
    expect(verificationFor(BARE)).toMatchObject({
      method: 'platform-owned',
      conference: { _ref: first.conferenceId },
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 1b. THE DERIVATION RULE
// ───────────────────────────────────────────────────────────────────────────

describe('the minted host names the EDITION', () => {
  it('carries the edition year taken from the start date', async () => {
    await provisionOrganization(
      input({
        conference: {
          title: 'Cloud Native Days Oslo 2031',
          city: 'Oslo',
          country: 'Norway',
          startDate: '2031-09-14',
          endDate: '2031-09-15',
        },
      }),
    )
    expect(theConference().domains).toEqual([BARE, `${SLUG}-2031.${SUFFIX}`])
  })

  it('is ONE label above the platform suffix — a wildcard certificate covers no more', async () => {
    await provisionOrganization(input())

    // `acme-2027.konf.run`, never `2027.acme.konf.run`: `*.konf.run` secures
    // the first and NOT the second, and per-tenant certificates are the exact
    // work the wildcard exists to avoid.
    for (const host of theConference().domains as string[]) {
      expect(host.split('.')).toHaveLength(SUFFIX.split('.').length + 1)
      expect(host.slice(0, -(SUFFIX.length + 1))).not.toContain('.')
    }
  })

  it('asserts NO year when the tenant has no dates yet', async () => {
    const outcome = await provisionOrganization(undated())
    expect(outcome.ok).toBe(true)

    // The bare slug ALONE, NOT a guess at the current year: the host is
    // permanent and unmigratable, so a customer signing up in December for next
    // year's conference must not be stuck with last year's address forever.
    expect(theConference().domains).toEqual([BARE])
    expect(BARE).not.toMatch(/\d{4}/)
  })

  it('gives an undated tenant a REACHABLE host all the same', async () => {
    const outcome = await provisionOrganization(undated())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Deferring the claim until dates exist would recreate the very bug this
    // change fixes, so the undated tenant is allocated exactly like a dated one.
    expect(verificationFor(BARE)).toMatchObject({
      method: 'platform-owned',
      status: 'verified',
      conference: { _ref: outcome.conferenceId },
    })
  })

  it('keeps the bare label distinct from every dated one', async () => {
    await provisionOrganization(undated())
    // The bare label and every `<slug>-<year>` label are distinct by
    // construction, so the dated rule stays intact for later editions.
    expect(theConference().domains).not.toContain(DATED)
  })
})

describe('the minted host is issued ONCE, never re-derived', () => {
  it('survives a later org-slug rename untouched', async () => {
    const outcome = await provisionOrganization(input())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // kontroll can rename the organization afterwards.
    const org = docs.get(outcome.organizationId)!
    docs.set(outcome.organizationId, {
      ...org,
      slug: { _type: 'slug', current: 'renamed-entirely' },
    })

    // The address is in the wild, so it must not move, break or re-issue: both
    // the claim and the allocation are keyed by the hostname itself and nothing
    // re-derives them at read time.
    expect(theConference().domains).toEqual(MINTED)
    expect(verificationFor(DATED)).toMatchObject({
      method: 'platform-owned',
      conference: { _ref: outcome.conferenceId },
    })
    expect(verificationFor(`renamed-entirely.${SUFFIX}`)).toBeUndefined()
  })
})

describe('labels the platform keeps for itself', () => {
  it.each(['www', 'api', 'admin', 'auth', 'my', 'status'])(
    'refuses the slug %s outright and writes nothing',
    async (slug) => {
      const outcome = await provisionOrganization(
        undated({
          organization: { name: 'X', slug, contactEmail: 'hello@cno.no' },
        }),
      )

      expect(outcome.ok).toBe(false)
      expect(ofType('organization')).toHaveLength(0)
      expect(ofType('conference')).toHaveLength(0)
      expect(ofType('domainVerification')).toHaveLength(0)
    },
  )

  it('refuses even when the caller supplied its own domain', async () => {
    // Not a reachability problem — this tenant HAS an address. The point is
    // that a permanent, globally unique claim on the platform's own `auth`
    // hostname must never be handed out by accident.
    const outcome = await provisionOrganization(
      undated({
        organization: { name: 'X', slug: 'auth', contactEmail: 'hello@cno.no' },
        domains: ['oslo.cloudnativedays.no'],
      }),
    )
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.rejection).toEqual({ code: 'reserved_slug', slug: 'auth' })
    expect(ofType('conference')).toHaveLength(0)
  })

  it('refuses a reserved slug even though the DATED label would be harmless', async () => {
    // `admin-2027` is fine on its own, but the pair is all-or-nothing and
    // `admin.konf.run` is not a tenant's to take.
    const outcome = await provisionOrganization(
      input({
        organization: {
          name: 'X',
          slug: 'admin',
          contactEmail: 'hello@cno.no',
        },
      }),
    )
    expect(outcome.ok).toBe(false)
    expect(ofType('conference')).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. THE MINTED HOST AND CALLER-SUPPLIED DOMAINS COEXIST
// ───────────────────────────────────────────────────────────────────────────

describe('caller-supplied domains', () => {
  it('keeps a custom domain AND mints both platform hosts, minted first', async () => {
    const outcome = await provisionOrganization(
      input({ domains: ['oslo.cloudnativedays.no'] }),
    )
    expect(outcome.ok).toBe(true)

    expect(theConference().domains).toEqual([
      ...MINTED,
      'oslo.cloudnativedays.no',
    ])
  })

  it('proves a custom domain by DNS while the minted host is allocated outright', async () => {
    const outcome = await provisionOrganization(
      input({ domains: ['oslo.cloudnativedays.no'] }),
    )
    expect(outcome.ok).toBe(true)

    expect(verificationFor(BARE)).toMatchObject({
      method: 'platform-owned',
      status: 'verified',
    })
    // The custom domain gets NO free pass: pending, with a token to publish.
    const custom = verificationFor('oslo.cloudnativedays.no')
    expect(custom).toMatchObject({ method: 'dns-txt', status: 'pending' })
    expect(typeof custom?.token).toBe('string')
  })

  it('deduplicates a caller that names a minted host itself', async () => {
    const outcome = await provisionOrganization(input({ domains: [DATED] }))
    expect(outcome.ok).toBe(true)

    expect(theConference().domains).toEqual(MINTED)
    expect(ofType('domainVerification')).toHaveLength(2)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. COLLISION — PERMANENT, SO REFUSED RATHER THAN WORKED AROUND
// ───────────────────────────────────────────────────────────────────────────

describe('the minted host is already claimed', () => {
  function claimedBySomeoneElse(entry: string) {
    docs.set('conference-incumbent', {
      _id: 'conference-incumbent',
      _type: 'conference',
      title: 'Incumbent',
      domains: [entry],
    })
  }

  it('writes NOTHING when another conference holds the exact host', async () => {
    claimedBySomeoneElse(BARE)
    const outcome = await provisionOrganization(input())

    expect(outcome.ok).toBe(false)
    // The guard that a permissive implementation cannot survive: no tenant.
    expect(ofType('organization')).toHaveLength(0)
    expect(ofType('conference')).toEqual([
      expect.objectContaining({ _id: 'conference-incumbent' }),
    ])
    expect(ofType('speaker')).toHaveLength(0)
    // …and the incumbent's claim is untouched.
    expect(docs.get('conference-incumbent')?.domains).toEqual([BARE])
  })

  it('writes NOTHING when a WILDCARD over the zone would capture it', async () => {
    claimedBySomeoneElse(`*.${SUFFIX}`)
    const outcome = await provisionOrganization(input())

    expect(outcome.ok).toBe(false)
    expect(ofType('organization')).toHaveLength(0)
    expect(ofType('conference')).toHaveLength(1)
  })

  it('names the collision distinctly from a domain the caller actually asked for', async () => {
    claimedBySomeoneElse(BARE)
    const outcome = await provisionOrganization(input())
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    // A caller that never mentioned this host must be able to tell "your slug's
    // address is taken" from "a domain you sent is taken" — the remedies differ.
    expect(outcome.rejection).toEqual({
      code: 'platform_host_taken',
      host: BARE,
      slug: SLUG,
    })
  })

  it('never mints a fallback label — the address always matches the slug', async () => {
    claimedBySomeoneElse(BARE)
    await provisionOrganization(input())
    // No `-2`, no random suffix: NOTHING was claimed at all.
    const claims = ofType('conference').flatMap(
      (d) => (d.domains as string[] | undefined) ?? [],
    )
    expect(claims).toEqual([BARE])
  })

  it('REFUSES rather than transferring — a first edition never steals', async () => {
    // The short address is transferable BETWEEN an org's own editions, but
    // provisioning only ever creates an org's first, so any holder here is a
    // foreign one and taking it would be a cross-tenant hijack.
    claimedBySomeoneElse(BARE)
    await provisionOrganization(input())
    expect(docs.get('conference-incumbent')?.domains).toEqual([BARE])
    expect(ofType('conference')).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. NO ADDRESS DERIVABLE — REFUSE, NEVER COMMIT A GHOST TENANT
// ───────────────────────────────────────────────────────────────────────────

describe('no address can be minted', () => {
  it('refuses outright when the suffix is unset and no domain was supplied', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', '')
    const outcome = await provisionOrganization(input())

    expect(outcome.ok).toBe(false)
    // The ghost tenant this whole change exists to prevent: an organization and
    // a conference no host serves and no organizer can reach.
    expect(ofType('organization')).toHaveLength(0)
    expect(ofType('conference')).toHaveLength(0)
    expect(ofType('speaker')).toHaveLength(0)
    expect(ofType('domainVerification')).toHaveLength(0)
  })

  it('refuses without reading the content lake at all', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', '')
    await provisionOrganization(input())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a slug DNS cannot carry (>63-character label) rather than minting a dead host', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', SUFFIX)
    const slug = 'a'.repeat(64)
    const outcome = await provisionOrganization(
      input({
        organization: {
          name: 'Long',
          slug,
          contactEmail: 'hello@cno.no',
        },
      }),
    )

    expect(outcome.ok).toBe(false)
    expect(ofType('conference')).toHaveLength(0)
  })

  it('still provisions with an UNSET suffix when the caller supplies a domain', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', '')
    const outcome = await provisionOrganization(
      input({ domains: ['oslo.cloudnativedays.no'] }),
    )

    expect(outcome.ok).toBe(true)
    // A deployment that operates no zone of its own is unaffected: the tenant
    // has an address, so there is nothing to refuse.
    expect(theConference().domains).toEqual(['oslo.cloudnativedays.no'])
    expect(verificationFor('oslo.cloudnativedays.no')).toMatchObject({
      method: 'dns-txt',
    })
  })

  it('mints nothing for a host outside the configured zone even under allocation', async () => {
    // Re-pointing the suffix must not retro-grant a host we no longer own.
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'elsewhere.example')
    const outcome = await provisionOrganization(
      input({ domains: ['oslo.cloudnativedays.no'] }),
    )
    expect(outcome.ok).toBe(true)

    expect(theConference().domains).toEqual([
      `${SLUG}.elsewhere.example`,
      `${SLUG}-2027.elsewhere.example`,
      'oslo.cloudnativedays.no',
    ])
    expect(verificationFor('oslo.cloudnativedays.no')).toMatchObject({
      method: 'dns-txt',
    })
    expect(verificationFor(`${SLUG}-2027.elsewhere.example`)).toMatchObject({
      method: 'platform-owned',
    })
    // The hosts under the OLD zone were never claimed, so nothing grants them.
    expect(verificationFor(BARE)).toBeUndefined()
    expect(verificationFor(DATED)).toBeUndefined()
  })
})
