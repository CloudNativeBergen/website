/**
 * The organizer's per-host workshop sign-in view. Only the Sanity read and
 * workshop gate are supplied; the proof policy and standing are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifiedHost } from '../../../__tests__/helpers/workshopSignIn'
import type { DomainVerificationRecord } from './types'

const records: DomainVerificationRecord[] = []
const listDomainVerificationsForConference = vi.fn<
  (conferenceId: string) => Promise<DomainVerificationRecord[]>
>(async () => records)

vi.mock('./sanity', () => ({
  listDomainVerificationsForConference: (conferenceId: string) =>
    listDomainVerificationsForConference(conferenceId),
}))

const workshopsEnabled = vi.fn<(conference: unknown) => Promise<boolean>>(
  async () => true,
)
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (conference: unknown) =>
    workshopsEnabled(conference),
}))

const { listConferenceDomainViews, listDomainVerificationViews } =
  await import('./sync')

beforeEach(() => {
  records.length = 0
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function signInOf(hostname: string, domains: string[]) {
  const views = await listDomainVerificationViews('conference-1', domains, {
    workshops: true,
  })
  return views.find((view) => view.hostname === hostname)?.workshopSignIn
}

describe('listDomainVerificationViews — workshop sign-in per host', () => {
  it('is available for a tenant’s verified DNS proof', async () => {
    records.push(verifiedHost('tenant.example.org'))
    await expect(
      signInOf('tenant.example.org', ['tenant.example.org']),
    ).resolves.toEqual({ state: 'available' })
  })

  it('derives verification and sign-in from ONE read for this conference', async () => {
    records.push(verifiedHost('conf.example.org'))
    const [view] = await listDomainVerificationViews(
      'conference-1',
      ['conf.example.org'],
      { workshops: true },
    )

    expect(view).toMatchObject({
      hostname: 'conf.example.org',
      status: 'verified',
      recordValue: 'konf-domain-verification=tok',
      workshopSignIn: { state: 'available' },
    })
    expect(listDomainVerificationsForConference).toHaveBeenCalledTimes(1)
    expect(listDomainVerificationsForConference).toHaveBeenCalledWith(
      'conference-1',
    )
  })

  it('is unverified for an unproven claim and a claim with no record', async () => {
    records.push(
      verifiedHost('conf.example.org', {
        status: 'pending',
        lastSuccessAt: null,
      }),
    )
    const domains = ['conf.example.org', 'new.example.org']
    await expect(signInOf('conf.example.org', domains)).resolves.toEqual({
      state: 'unverified',
    })
    await expect(signInOf('new.example.org', domains)).resolves.toEqual({
      state: 'unverified',
    })
  })

  it('is available for a platform-allocated host of any tenant', async () => {
    records.push(
      verifiedHost('tenant.konf.run', {
        method: 'platform-owned',
        lastSuccessAt: null,
      }),
    )
    await expect(
      signInOf('tenant.konf.run', ['tenant.konf.run']),
    ).resolves.toEqual({ state: 'available' })
  })

  it('asks for proof on a grandfathered record inside its grace period', async () => {
    records.push(
      verifiedHost('cloudnativedays.example.org', {
        method: 'grandfathered',
        status: 'pending',
        lastSuccessAt: null,
        graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    )
    const [view] = await listDomainVerificationViews(
      'conference-1',
      ['cloudnativedays.example.org'],
      { workshops: true },
    )
    expect(view).toMatchObject({
      hostname: 'cloudnativedays.example.org',
      grandfathered: true,
      redirectAllowlisted: true,
      workshopSignIn: { state: 'unverified' },
    })
  })

  it('is unverified when the DNS proof stops resolving', async () => {
    records.push(verifiedHost('conf.example.org', { status: 'failing' }))
    await expect(
      signInOf('conf.example.org', ['conf.example.org']),
    ).resolves.toEqual({ state: 'unverified' })
  })

  it('keeps local dev and wildcard entries visible without a standing', async () => {
    const views = await listDomainVerificationViews(
      'conference-1',
      ['localhost:3000', '*.example.org'],
      { workshops: true },
    )
    expect(views).toMatchObject([
      {
        hostname: 'localhost:3000',
        status: 'pending',
        devOnly: true,
        workshopSignIn: null,
      },
      {
        hostname: '*.example.org',
        status: 'pending',
        wildcard: true,
        workshopSignIn: null,
      },
    ])
  })
})

describe('listDomainVerificationViews — workshops off', () => {
  it('still reads domain verification when there is no sign-in standing', async () => {
    records.push(verifiedHost('conf.example.org'))
    const [view] = await listDomainVerificationViews('conference-1', [
      'conf.example.org',
    ])

    expect(view).toMatchObject({
      hostname: 'conf.example.org',
      status: 'verified',
      recordValue: 'konf-domain-verification=tok',
      workshopSignIn: null,
    })
    expect(listDomainVerificationsForConference).toHaveBeenCalledTimes(1)
  })
})

/** The shared entry point uses the conference's own workshop gate. */
describe('listConferenceDomainViews', () => {
  const CONFERENCE = {
    _id: 'conference-1',
    domains: ['conf.example.org'],
    organization: { _ref: 'org-tenant' },
    ticketingProvider: 'checkin' as const,
  }

  it('asks the gate about this conference and shows the standing when it is on', async () => {
    workshopsEnabled.mockResolvedValue(true)
    records.push(verifiedHost('conf.example.org'))

    const [view] = await listConferenceDomainViews(CONFERENCE)

    expect(workshopsEnabled).toHaveBeenCalledWith(CONFERENCE)
    expect(view.hostname).toBe('conf.example.org')
    expect(view.workshopSignIn).toEqual({ state: 'available' })
  })

  it('treats another conference’s record as unverified without exposing its proof', async () => {
    records.push(
      verifiedHost('conf.example.org', {
        conferenceId: 'conference-2',
        token: 'foreign-token',
      }),
    )

    const [view] = await listDomainVerificationViews(
      'conference-1',
      ['conf.example.org'],
      { workshops: true },
    )

    expect(view).toMatchObject({
      hostname: 'conf.example.org',
      status: 'pending',
      recordValue: null,
      workshopSignIn: { state: 'unverified' },
    })
  })

  it('asks a tenant to verify a claimed host with no record', async () => {
    workshopsEnabled.mockResolvedValue(true)
    const [view] = await listConferenceDomainViews({
      ...CONFERENCE,
      domains: ['new.example.org'],
    })
    expect(view).toMatchObject({
      hostname: 'new.example.org',
      status: 'pending',
      workshopSignIn: { state: 'unverified' },
    })
  })

  it('shows no standing when the gate is off', async () => {
    workshopsEnabled.mockResolvedValue(false)
    records.push(verifiedHost('conf.example.org'))

    const [view] = await listConferenceDomainViews(CONFERENCE)

    expect(view).toMatchObject({
      hostname: 'conf.example.org',
      status: 'verified',
      recordValue: 'konf-domain-verification=tok',
      workshopSignIn: null,
    })
  })
})
