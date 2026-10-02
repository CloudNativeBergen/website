/**
 * @vitest-environment jsdom
 *
 * The picker's Reset affordance (#1261): shown only when a template is
 * applied AND a recipient is chosen — re-applying with nobody selected would
 * merge a bare `{{{CONTACT_NAMES}}}` into the body.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SponsorTemplatePicker } from '@/components/admin/sponsor/SponsorTemplatePicker'

const templates = [
  {
    _id: 'tpl-a',
    _createdAt: '',
    _updatedAt: '',
    title: 'Info A',
    slug: { current: 'a' },
    category: 'follow-up',
    language: 'en',
    subject: 'Hi {{{CONTACT_NAMES}}}',
    isDefault: true,
  },
  {
    _id: 'tpl-contract',
    _createdAt: '',
    _updatedAt: '',
    title: 'Contract',
    slug: { current: 'c' },
    category: 'contract',
    language: 'en',
    subject: 'Contract',
  },
]

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      emailTemplates: {
        list: { useQuery: () => ({ data: templates, isLoading: false }) },
      },
    },
  },
}))

const conference = {
  title: 'Conf',
  city: 'Bergen',
  startDate: '2026-10-28',
  domains: ['x.test'],
}

afterEach(cleanup)

describe('SponsorTemplatePicker', () => {
  it('shows Reset only when a template is applied and a recipient is chosen', () => {
    const onApply = vi.fn()
    const { rerender } = render(
      <SponsorTemplatePicker
        sponsorName="Acme"
        contactNames={undefined}
        conference={conference}
        selectedId="tpl-a"
        onApply={onApply}
        excludeCategories={['contract']}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Reset' }),
    ).not.toBeInTheDocument()
    rerender(
      <SponsorTemplatePicker
        sponsorName="Acme"
        contactNames="Kari"
        conference={conference}
        selectedId="tpl-a"
        onApply={onApply}
        excludeCategories={['contract']}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onApply).toHaveBeenCalledWith(
      'Hi Kari',
      expect.any(Array),
      expect.objectContaining({ _id: 'tpl-a' }),
    )
  })

  it('hides excluded categories and falls back to the placeholder for an unknown applied id', () => {
    render(
      <SponsorTemplatePicker
        sponsorName="Acme"
        contactNames="Kari"
        conference={conference}
        selectedId="tpl-gone"
        onApply={vi.fn()}
        excludeCategories={['contract']}
      />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(
      screen.queryByRole('option', { name: /Contract/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset' }),
    ).not.toBeInTheDocument()
  })
})
