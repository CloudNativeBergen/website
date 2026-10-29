/**
 * @vitest-environment jsdom
 *
 * THE CRM PAGE REFUSES NON-ORGANIZERS BEFORE ITS PRIVILEGED READ (#1261).
 *
 * /admin/sponsors/crm asks `getConferenceForCurrentDomain` for the sponsor
 * invite link — a reusable Checkin token that buys hidden sponsor tickets —
 * and hands the whole conference to a client component, so it rides the RSC
 * payload. The admin layout's organizer check is presentation only (see
 * `denyNonOrganizer`), so the page must refuse for itself, and the point is
 * that the read NEVER HAPPENS for a denied request, not that its output is
 * withheld afterwards. Delete the guard lines in the page and this fails.
 */
import { render, screen, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({
  deny: vi.fn(),
  getConference: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'cloudnativebergen.dev' }),
}))
vi.mock('@/lib/authz/page-guard', () => ({ denyNonOrganizer: h.deny }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/components/admin', () => ({
  ErrorDisplay: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('@/components/admin/sponsor-crm', () => ({
  SponsorCRMPageClient: () => <div data-testid="crm-client" />,
}))

import AdminSponsorsCRM from '@/app/(admin)/admin/sponsors/crm/page'

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: {
      _id: 'conf',
      title: 'Conf',
      sponsorRegistrationLink: 'https://tickets.example/secret-pass',
    },
    error: null,
  })
})

describe('/admin/sponsors/crm', () => {
  it('renders the denial and never performs the privileged read for a non-organizer', async () => {
    h.deny.mockResolvedValue(<div>Access Denied</div>)
    render(await AdminSponsorsCRM())
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(h.getConference).not.toHaveBeenCalled()
    expect(screen.queryByTestId('crm-client')).not.toBeInTheDocument()
  })

  it('reads WITH the sponsor registration link for an organizer', async () => {
    h.deny.mockResolvedValue(null)
    render(await AdminSponsorsCRM())
    expect(h.getConference).toHaveBeenCalledWith(
      expect.objectContaining({ includeSponsorRegistrationLink: true }),
    )
    expect(screen.getByTestId('crm-client')).toBeInTheDocument()
  })
})
