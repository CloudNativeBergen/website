/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { SponsorHealthPanel } from '@/components/admin/sponsor-crm/SponsorHealthPanel'
import type { SponsorHealthViolation } from '@/lib/sponsor-crm/health'

function violation(
  overrides: Partial<SponsorHealthViolation> = {},
): SponsorHealthViolation {
  return {
    sponsorId: 'sfc-1',
    sponsorName: 'Acme',
    axis: 'pipeline',
    state: 'closed-won',
    missing: [
      {
        field: 'tier',
        label: 'Sponsor tier',
        source: 'pipeline',
        severity: 'required',
        message: 'Set a sponsor tier before marking as Won.',
      },
    ],
    hidesFromPublicSite: false,
    ...overrides,
  }
}

describe('SponsorHealthPanel', () => {
  it('lists a violation with the sponsor name and the specific rule it breaks', () => {
    render(<SponsorHealthPanel violations={[violation()]} />)

    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(
      screen.getByText(/set a sponsor tier before marking as won/i),
    ).toBeInTheDocument()
  })

  it('renders nothing when there are no violations', () => {
    const { container } = render(<SponsorHealthPanel violations={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('distinguishes a public-site-hiding violation with a prominent badge', () => {
    render(
      <SponsorHealthPanel
        violations={[
          violation({
            sponsorId: 'sfc-hidden',
            sponsorName: 'Hidden Co',
            hidesFromPublicSite: true,
          }),
          violation({
            sponsorId: 'sfc-other',
            sponsorName: 'Other Co',
            axis: 'contract',
            state: 'contract-sent',
            hidesFromPublicSite: false,
          }),
        ]}
      />,
    )

    // The hide badge appears exactly once — only for the hiding violation.
    expect(screen.getAllByText(/hidden from the public site/i)).toHaveLength(1)
  })
})
