/**
 * @vitest-environment jsdom
 *
 * The "Early sign-ups" list on `/admin/workshops` (#1348, spec §9), as it
 * renders what `workshop.admin.listEarlySignups` answered: person, workshop,
 * status and sponsor of each early sign-up, and a control that narrows it to
 * one sponsor. The list filters NOTHING itself: it shows the rows it is given
 * and reports the sponsor the organizer picked. That the narrowed rows come
 * from the server is asserted on the page
 * (`../WorkshopsClientPage.earlySignups.test.tsx`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { EarlySignupRow } from '@/lib/workshop/early-access/signups'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { EarlySignupsList } from './EarlySignupsList'

afterEach(cleanup)

const ACME = { _id: 'sfc-acme', name: 'Acme AS' }
const GLOBEX = { _id: 'sfc-globex', name: 'Globex' }
const row = (
  id: string,
  userName: string,
  rest: Partial<EarlySignupRow> = {},
): EarlySignupRow => ({
  _id: id,
  userName,
  userEmail: `${id}@example.com`,
  status: WorkshopSignupStatus.CONFIRMED,
  signedUpAt: '2026-06-09T08:05:00Z',
  workshop: { _id: 'ws-k8s', title: 'Kubernetes 101' },
  earlyAccess: { sponsor: ACME },
  ...rest,
})
const ROWS = [
  row('ada', 'Ada Lovelace'),
  row('bea', 'Bea Arthur', {
    status: WorkshopSignupStatus.WAITLIST,
    workshop: { _id: 'ws-gitops', title: 'GitOps in practice' },
    earlyAccess: { sponsor: GLOBEX },
    signedUpAt: '2026-06-10T10:00:00Z',
  }),
  // The sponsor was removed from the conference.
  row('cy', 'Cy Young', { earlyAccess: { sponsor: null } }),
]

function renderList(
  props: Partial<React.ComponentProps<typeof EarlySignupsList>> = {},
) {
  const onSponsorChange = vi.fn()
  render(
    <EarlySignupsList
      signups={ROWS}
      sponsors={[ACME, GLOBEX]}
      sponsorId={null}
      onSponsorChange={onSponsorChange}
      {...props}
    />,
  )
  return { onSponsorChange }
}

const cells = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) =>
      within(tr)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )

describe('the "Early sign-ups" list', () => {
  it('is titled "Early sign-ups"', () => {
    renderList()

    expect(
      screen.getByRole('heading', { name: 'Early sign-ups' }),
    ).toBeVisible()
  })

  it('shows the person, the workshop, the status, the sponsor and the day of each sign-up', () => {
    renderList()

    expect(cells()).toEqual([
      [
        'Ada Lovelaceada@example.com',
        'Kubernetes 101',
        'Confirmed',
        'Acme AS',
        '9. juni 2026',
      ],
      [
        'Bea Arthurbea@example.com',
        'GitOps in practice',
        'Waitlist',
        'Globex',
        '10. juni 2026',
      ],
      [
        'Cy Youngcy@example.com',
        'Kubernetes 101',
        'Confirmed',
        'early access',
        '9. juni 2026',
      ],
    ])
  })

  it('says how many sign-ups it shows', () => {
    renderList()
    expect(screen.getByText('3 early sign-ups')).toBeVisible()
    cleanup()

    renderList({ signups: [ROWS[0]], sponsorId: 'sfc-acme' })
    expect(screen.getByText('1 early sign-up through Acme AS')).toBeVisible()
  })

  it('offers every sponsor it was given, and "All sponsors"', () => {
    renderList()

    const control = screen.getByRole('combobox', { name: 'Sponsor' })
    expect(
      within(control)
        .getAllByRole('option')
        .map((option) => [
          (option as HTMLOptionElement).value,
          option.textContent,
        ]),
    ).toEqual([
      ['', 'All sponsors'],
      ['sfc-acme', 'Acme AS'],
      ['sfc-globex', 'Globex'],
    ])
    expect(control).toHaveValue('')
  })

  it('reports the sponsor the organizer picks, and filters nothing itself', () => {
    const { onSponsorChange } = renderList()

    fireEvent.change(screen.getByRole('combobox', { name: 'Sponsor' }), {
      target: { value: 'sfc-globex' },
    })

    expect(onSponsorChange.mock.calls).toEqual([['sfc-globex']])
    // The rows are the ones it was given, until it is given others.
    expect(cells()).toHaveLength(3)
  })

  it('reports "All sponsors" as no sponsor', () => {
    const { onSponsorChange } = renderList({ sponsorId: 'sfc-acme' })

    expect(screen.getByRole('combobox', { name: 'Sponsor' })).toHaveValue(
      'sfc-acme',
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Sponsor' }), {
      target: { value: '' },
    })

    expect(onSponsorChange.mock.calls).toEqual([[null]])
  })

  it('keeps what it is narrowed to selectable when that sponsor is not one of the conference’s', () => {
    renderList({ signups: [], sponsors: [ACME], sponsorId: 'sfc-removed' })

    const control = screen.getByRole('combobox', { name: 'Sponsor' })
    expect(control).toHaveValue('sfc-removed')
    expect(
      within(control)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All sponsors', 'Acme AS', 'A sponsor not in this conference'])
  })
})

describe('the "Early sign-ups" list with nothing to show', () => {
  it('says that nobody has signed up early, and offers no narrowing', () => {
    renderList({ signups: [], sponsors: [] })

    expect(screen.getByText('No early sign-ups yet')).toBeVisible()
    expect(
      screen.getByText(
        'A sign-up made through a sponsor’s early-access link, before registration opens for everyone, is listed here.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('narrowed to a sponsor without sign-ups, names the sponsor and offers all of them again', () => {
    const { onSponsorChange } = renderList({
      signups: [],
      sponsors: [ACME, GLOBEX],
      sponsorId: 'sfc-globex',
    })

    expect(screen.getByText('No early sign-ups through Globex')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Show all sponsors' }))

    expect(onSponsorChange.mock.calls).toEqual([[null]])
  })

  it('says it is reading while the first answer is on its way', () => {
    renderList({ signups: undefined, sponsors: undefined })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the early sign-ups…',
    )
    expect(screen.queryByText('No early sign-ups yet')).toBeNull()
  })

  it('says so when they could not be read, and offers to try again', () => {
    const onRetry = vi.fn()
    renderList({
      signups: undefined,
      sponsors: undefined,
      error: 'The early sign-ups could not be read.',
      onRetry,
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The early sign-ups could not be read.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('No early sign-ups yet')).toBeNull()
  })
})
