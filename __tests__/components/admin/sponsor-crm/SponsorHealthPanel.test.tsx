/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
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

  it('shows a distinct error notice when the audit failed, instead of silently looking healthy', () => {
    const { container } = render(<SponsorHealthPanel violations={[]} isError />)

    expect(container).not.toBeEmptyDOMElement()
    expect(screen.getByText(/couldn.t check data health/i)).toBeInTheDocument()
  })

  it('attaches the public-site-hide badge to the hiding row only, not the others', () => {
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

    const hiddenRow = screen.getByText('Hidden Co').closest('li')!
    const otherRow = screen.getByText('Other Co').closest('li')!

    expect(
      within(hiddenRow).getByText(/hidden from the public site/i),
    ).toBeInTheDocument()
    expect(
      within(otherRow).queryByText(/hidden from the public site/i),
    ).not.toBeInTheDocument()
  })

  it('labels each violation with its axis and a human-readable state', () => {
    render(
      <SponsorHealthPanel
        violations={[
          violation({ axis: 'pipeline', state: 'closed-won' }),
          violation({
            sponsorId: 'sfc-2',
            axis: 'contract',
            state: 'contract-sent',
          }),
          // An unmapped/future state falls through to its raw value rather than
          // rendering blank.
          violation({
            sponsorId: 'sfc-3',
            axis: 'signature',
            state: 'mystery-state',
          }),
        ]}
      />,
    )

    expect(screen.getByText('Pipeline · Closed - Won')).toBeInTheDocument()
    expect(screen.getByText('Contract · Contract Sent')).toBeInTheDocument()
    expect(screen.getByText('Signature · mystery-state')).toBeInTheDocument()
  })
})
