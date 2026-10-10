/**
 * @vitest-environment node
 *
 * The /admin/settings page's domain card (#683, #1298): it server-renders what
 * `listConferenceDomainViews` answers for THIS conference — the same call the
 * router and system status make — so a regression to a call that drops the
 * workshop sign-in standing shows here. The card does not refetch for the
 * provider's `staleTime`, so what the page renders is what the organizer sees.
 *
 * Data modules are the boundary; the page's composition is real. The page is
 * not rendered to HTML: the element tree it returns is inspected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactNode } from 'react'

const CONFERENCE = {
  _id: 'conference-1',
  title: 'CNDN 2026',
  domains: ['2026.cloudnativedays.no'],
  organization: { _ref: 'org-1', _type: 'reference' },
  ticketingProvider: 'checkin',
  organizers: [],
}

vi.mock('@/lib/authz/page-guard', () => ({
  denyNonOrganizer: async () => null,
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => null }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: CONFERENCE,
    domain: '2026.cloudnativedays.no',
    error: null,
  }),
}))
vi.mock('@/lib/system-status/checks', () => ({
  buildSystemChecks: async () => [],
}))
vi.mock('@/lib/settings/activation-server', () => ({
  resolveActivationChecklist: async () => ({ items: [], done: true }),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async () => ({
    _id: 'org-1',
    name: 'CNDN',
    plan: 'pro',
  }),
  getAllOrganizations: async () => [],
}))
vi.mock('@/lib/features/platform', () => ({
  isPlatformOrgRequest: async () => false,
}))
vi.mock('@/lib/features/entitlements', () => ({
  listEntitledFeatures: () => [],
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: async () => true,
}))

const VIEWS = [
  { hostname: '2026.cloudnativedays.no', workshopSignIn: { state: 'pending' } },
]
const listConferenceDomainViews = vi.fn<
  (conference: unknown) => Promise<typeof VIEWS>
>(async () => VIEWS)
vi.mock('@/lib/domain-verification', () => ({
  listConferenceDomainViews: (conference: unknown) =>
    listConferenceDomainViews(conference),
}))

const { default: AdminSettings } =
  await import('@/app/(admin)/admin/settings/page')
const { DomainVerificationCard } =
  await import('@/components/admin/DomainVerificationCard')

/** Every element in the returned tree, without rendering components. */
function elementsOf(
  node: ReactNode,
): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  const own = Object.values(node.props).flatMap((value) =>
    isValidElement(value) || Array.isArray(value)
      ? elementsOf(value as ReactNode)
      : [],
  )
  return [node, ...own]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/admin/settings — domain card', () => {
  it('renders exactly what listConferenceDomainViews answers for this conference', async () => {
    const page = await AdminSettings()

    expect(listConferenceDomainViews).toHaveBeenCalledTimes(1)
    expect(listConferenceDomainViews).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'conference-1',
        domains: ['2026.cloudnativedays.no'],
        organization: CONFERENCE.organization,
        ticketingProvider: 'checkin',
      }),
    )
    const cards = elementsOf(page).filter(
      (element) => element.type === DomainVerificationCard,
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].props.initialDomains).toBe(VIEWS)
  })
})
