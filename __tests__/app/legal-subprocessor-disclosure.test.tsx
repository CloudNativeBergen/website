/**
 * @vitest-environment node
 *
 * #690. The /privacy subprocessor list is a LEGAL REPRESENTATION by the tenant,
 * not copy. It was hardcoded JSX served identically on every domain, so a tenant
 * selling through Tito told its attendees Checkin.no processes their data, and a
 * tenant with no workshop entitlement disclosed WorkOS as processing attendee
 * email, name and user ID.
 *
 * Every case below runs the REAL page against a real resolver, varying only what
 * the conference and organization documents say and which credentials the
 * environment holds. Nothing about the disclosure module is stubbed.
 *
 * Each assertion is made in BOTH directions. A test that only proved "Tito
 * appears" would also pass on a build that listed every vendor for everyone —
 * which is precisely the bug — so each names the vendor that must NOT appear.
 *
 * The last group is the one that matters most: a FAILED read must not SHORTEN
 * the list. Nearly every feature gate in this codebase fails closed on a
 * rejected Sanity read, so a naive derivation would publish a shorter
 * subprocessor list for the length of an outage. That is the #855/#848 class on
 * the worst possible surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const sanityFetch = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientRead: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'live-tenant.example' })),
}))
vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: vi.fn(async () => true),
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))

import PrivacyPage from '@/app/(main)/privacy/page'
import TermsPage from '@/app/(main)/terms/page'

const PLATFORM_ORG = 'organization-platform'
const OTHER_ORG = 'organization-customer'

/** The names as they appear in the rendered markup. */
const CHECKIN = 'Checkin.no'
const TITO = 'Tito (ti.to)'
const PIRSCH = 'Pirsch Analytics'
const SLACK = 'Slack'
const WORKOS = 'WorkOS (AuthKit)'
const UNCERTAIN = 'May not apply to this event'

/**
 * The Cloud Native Days Norway shape, verified against the production dataset:
 * `ticketingProvider` is NULL with a full Checkin binding, an analytics code is
 * set, Slack channels are configured, and its organization IS the platform org.
 */
function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Norway 2026',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    contactEmail: 'contact@cloudnativedays.no',
    domains: ['live-tenant.example'],
    organization: { _ref: PLATFORM_ORG, _type: 'reference' },
    ticketingProvider: null,
    checkinCustomerId: 15509,
    checkinEventId: 218308,
    analyticsPirschCode: 'Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK',
    ...overrides,
  }
}

function organization(overrides: Record<string, unknown> = {}) {
  return {
    _id: PLATFORM_ORG,
    name: 'Cloud Native Days Norway',
    contactEmail: 'contact@cloudnativedays.no',
    legalJurisdiction: 'Norway',
    plan: 'pro',
    ...overrides,
  }
}

interface World {
  conference?: Record<string, unknown> | null
  organization?: Record<string, unknown> | null
  /** Reject the CONFERENCE read (a total outage). */
  conferenceReadFails?: boolean
  /** Reject every ORGANIZATION read, leaving the conference read healthy. */
  organizationReadFails?: boolean
  /**
   * The `_id → secretEnvSlug` rows, i.e. which tenants name their own credential
   * environment variables (RunKonf/platform#57). Its own read, so
   * `organizationReadFails` takes it down with the rest.
   */
  secretEnvSlugs?: { _id: string; secretEnvSlug: string }[]
}

/**
 * Route each Sanity read by its query so the conference read and the two
 * organization reads can fail independently — which is the whole point: the
 * dangerous case is a HEALTHY conference read next to a failing org read, where
 * the page happily renders and quietly drops the org-gated processors.
 */
function world({
  conference: conf = conference(),
  organization: org = organization(),
  conferenceReadFails = false,
  organizationReadFails = false,
  secretEnvSlugs = [],
}: World = {}) {
  sanityFetch.mockImplementation(async (query: string) => {
    if (query.includes('_type == "conference"')) {
      if (conferenceReadFails) throw new Error('ECONNREFUSED sanity.io')
      return conf
    }
    // The tenant → env-var-slug map. A LIST, so it is matched before the
    // single-document org reads below; it fails with them.
    if (query.includes('defined(secretEnvSlug)')) {
      if (organizationReadFails) throw new Error('ECONNREFUSED sanity.io')
      return secretEnvSlugs
    }
    // Both the legal-identity read (`*[_id == $id][0]{name,…}`) and
    // `getOrganizationById` (`*[_type == "organization" && _id == $orgId][0]`).
    if (organizationReadFails) throw new Error('ECONNREFUSED sanity.io')
    return org
  })
}

/** The pages return a nested async component; flush it to markup. */
async function render(page: () => Promise<ReactElement>): Promise<string> {
  const outer = (await page()) as ReactElement<{ domain: string }>
  const inner = await (
    outer.type as (p: { domain: string }) => Promise<ReactElement>
  )(outer.props)
  return renderToStaticMarkup(inner)
}

const renderPrivacy = () => render(PrivacyPage)
const renderTerms = () => render(TermsPage)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-platform-token')
  vi.stubEnv('TENANT_SECRETS_JSON', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the ticketing vendor disclosed is the one the tenant uses', () => {
  it('a Tito tenant does NOT disclose Checkin', async () => {
    world({
      conference: conference({
        organization: { _ref: OTHER_ORG, _type: 'reference' },
        ticketingProvider: 'tito',
        checkinCustomerId: undefined,
        checkinEventId: undefined,
        titoAccountSlug: 'acme',
        titoEventSlug: 'conf-2026',
      }),
      organization: organization({ _id: OTHER_ORG, name: 'Acme Events' }),
    })

    const html = await renderPrivacy()

    expect(html).toContain(TITO)
    expect(html).not.toContain(CHECKIN)
  })

  it('a Checkin tenant does NOT disclose Tito — the other direction', async () => {
    world()

    const html = await renderPrivacy()

    expect(html).toContain(CHECKIN)
    expect(html).not.toContain(TITO)
  })

  it('a tenant with no ticketing binding discloses NEITHER vendor', async () => {
    world({
      conference: conference({
        checkinCustomerId: undefined,
        checkinEventId: undefined,
      }),
    })

    const html = await renderPrivacy()

    expect(html).not.toContain(CHECKIN)
    expect(html).not.toContain(TITO)
    // …but the shared platform infrastructure is still there, so this is a
    // shortened list by RESOLUTION, not by a broken render.
    expect(html).toContain('Sanity.io')
  })
})

describe('analytics is disclosed only when the tenant configured it', () => {
  it('discloses Pirsch when a code is set', async () => {
    world()
    expect(await renderPrivacy()).toContain(PIRSCH)
  })

  it('omits Pirsch when there is no code — no script, no processor', async () => {
    world({ conference: conference({ analyticsPirschCode: undefined }) })
    expect(await renderPrivacy()).not.toContain(PIRSCH)
  })
})

describe('Slack and WorkOS follow the tenant, not the platform', () => {
  it('Cloud Native Days Norway keeps Checkin, Slack and Pirsch', async () => {
    // The hard constraint on this change: the platform org is also a tenant and
    // genuinely uses all three. Verified against the production documents.
    world()

    const html = await renderPrivacy()

    expect(html).toContain(CHECKIN)
    expect(html).toContain(SLACK)
    expect(html).toContain(PIRSCH)
    expect(html).toContain(WORKOS)
    expect(html).not.toContain(UNCERTAIN)
  })

  it('a customer tenant on the shared deployment discloses neither', async () => {
    world({
      conference: conference({
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organization: organization({
        _id: OTHER_ORG,
        name: 'Acme Events',
        plan: 'community',
      }),
    })

    const html = await renderPrivacy()

    expect(html).not.toContain(SLACK)
    expect(html).not.toContain(WORKOS)
    // Its own vendors are unaffected.
    expect(html).toContain(CHECKIN)
  })
})

describe('the email account the organizer sends through', () => {
  it('names the shared platform account by default', async () => {
    world()
    expect(await renderPrivacy()).toContain('shared platform sending account')
  })

  it('names the organizer’s OWN Resend account when it has one', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ [OTHER_ORG]: { email: { apiKey: 're_tenant_key' } } }),
    )
    world({
      conference: conference({
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organization: organization({ _id: OTHER_ORG, name: 'Acme Events' }),
    })

    const html = await renderPrivacy()

    expect(html).toContain('own Resend account')
    expect(html).not.toContain('shared platform sending account')
  })

  /**
   * The same fact, sourced from DISCRETE per-org env vars (RunKonf/platform#57).
   * A tenant sending on its own Resend account while this page says "shared
   * platform sending account" is a false statement on a GDPR disclosure, so the
   * disclosure must read every per-org source, not just the JSON blob.
   */
  it('names it for a tenant configured by discrete per-org env vars', async () => {
    const CNDN = 'organization-cloud-native-days'
    world({
      conference: conference({
        organization: { _ref: CNDN, _type: 'reference' },
      }),
      organization: organization({ _id: CNDN, name: 'Cloud Native Days' }),
      secretEnvSlugs: [{ _id: CNDN, secretEnvSlug: 'CNDN' }],
    })

    // Control: bound but unconfigured is still the shared account.
    expect(await renderPrivacy()).toContain('shared platform sending account')

    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn_own')
    const html = await renderPrivacy()
    expect(html).toContain('own Resend account')
    expect(html).not.toContain('shared platform sending account')
  })

  /**
   * The env-slug binding lives in Sanity now (RunKonf/platform#57), so the
   * dedicated-account statement depends on a lookup that can come back
   * INDETERMINATE. It must fail toward DISCLOSURE — the same direction as every
   * other org-gated signal here — and specifically must not print the confident
   * "shared platform sending account" sentence when nobody knows.
   *
   * A DUPLICATE SLUG is the case used, deliberately, and not an outage: with an
   * outage the page never reaches this signal at all (`organizationReadFailed`
   * short-circuits it three lines earlier), so an outage test would pass without
   * the catch existing and prove nothing. Here every organization read SUCCEEDS
   * — the map simply says two tenants claim `CNDN`, so the secret resolver
   * refuses both — which is the only way to reach the catch and therefore the
   * only case that tests it.
   */
  it('does not claim the SHARED account when the env-slug lookup is indeterminate', async () => {
    const CNDN = 'organization-cloud-native-days'
    const withSlugs = (slugs: { _id: string; secretEnvSlug: string }[]) =>
      world({
        conference: conference({
          organization: { _ref: CNDN, _type: 'reference' },
        }),
        organization: organization({ _id: CNDN, name: 'Cloud Native Days' }),
        secretEnvSlugs: slugs,
      })

    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn_own')

    // CONTROL: an unambiguous map produces the confident dedicated statement,
    // under an otherwise identical world.
    withSlugs([{ _id: CNDN, secretEnvSlug: 'CNDN' }])
    expect(await renderPrivacy()).toContain('own Resend account')

    withSlugs([
      { _id: CNDN, secretEnvSlug: 'CNDN' },
      { _id: 'organization-impostor', secretEnvSlug: 'CNDN' },
    ])
    const html = await renderPrivacy()
    expect(html).not.toContain('shared platform sending account')
    expect(html).not.toContain('own Resend account')
  })
})

describe('a failed read must NOT shorten the disclosure', () => {
  it('keeps Slack and WorkOS, marked uncertain, when the organization read fails', async () => {
    // A customer tenant: with a HEALTHY org read these two are correctly
    // absent (asserted above). The gates answer `false` on a rejected read too,
    // so a naive derivation would drop them silently. They must stay.
    world({
      conference: conference({
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organizationReadFails: true,
    })

    const html = await renderPrivacy()

    expect(html).toContain(SLACK)
    expect(html).toContain(WORKOS)
    expect(html).toContain(UNCERTAIN)
    expect(html).toContain('could not be read just now')
  })

  it('renders NO uncertainty notice when every signal resolved', async () => {
    // Without this the test above would pass on a build that marked everything
    // uncertain unconditionally, which proves nothing.
    world()

    const html = await renderPrivacy()

    expect(html).not.toContain(UNCERTAIN)
    expect(html).not.toContain('could not be read just now')
  })

  it('never names the PLATFORM as data controller on a failed identity read', async () => {
    // #848: `buildLegalConfig` used to fall back to `PLATFORM_NAME`, so an
    // outage published the platform as the controller of a customer's event.
    world({
      conference: conference({
        organizer: '',
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organizationReadFails: true,
    })

    const html = await renderPrivacy()

    expect(html).not.toContain('Konf')
    expect(html).toContain('Could not be confirmed right now')
  })

  it('serves an error — not a shortened list — when the CONFERENCE read fails', async () => {
    // With no conference document there is no controller to name and no
    // configuration to read, so there is nothing to over-disclose FROM. The
    // page must refuse rather than publish a list about a tenant it cannot see.
    world({ conferenceReadFails: true })

    const html = await renderPrivacy()

    expect(html).toContain('Privacy Policy Temporarily Unavailable')
    expect(html).not.toContain('Essential Service Providers')
    expect(html).not.toContain(CHECKIN)
  })

  it('still serves the real policy when the read succeeds — the other direction', async () => {
    world()

    const html = await renderPrivacy()

    expect(html).not.toContain('Privacy Policy Temporarily Unavailable')
    expect(html).toContain('Essential Service Providers')
  })
})

describe('/terms names only the sign-in routes this tenant has', () => {
  it('mentions WorkOS AuthKit for a tenant with workshops', async () => {
    world()
    expect(await renderTerms()).toContain('WorkOS AuthKit')
  })

  it('does NOT mention WorkOS AuthKit for a tenant without workshops', async () => {
    world({
      conference: conference({
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organization: organization({ _id: OTHER_ORG, name: 'Acme Events' }),
    })

    const html = await renderTerms()

    expect(html).not.toContain('WorkOS AuthKit')
    // The CFP sign-in routes it DOES have are still described.
    expect(html).toContain('GitHub or LinkedIn')
  })

  it('does not name the platform as the counterparty on a failed identity read', async () => {
    world({
      conference: conference({
        organizer: '',
        organization: { _ref: OTHER_ORG, _type: 'reference' },
      }),
      organizationReadFails: true,
    })

    const html = await renderTerms()

    expect(html).not.toContain('Konf')
    expect(html).toContain('could not be confirmed right now')
  })
})
