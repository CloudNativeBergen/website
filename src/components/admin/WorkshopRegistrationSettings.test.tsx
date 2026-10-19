/**
 * @vitest-environment jsdom
 *
 * The registration card on /admin/workshops and the sponsor start time
 * (#1345, spec `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §3): the status
 * label an organizer reads, the third time on the card, and what a save sends.
 *
 * The clock is pinned and every time is a literal around it. The mutation is
 * the mocked boundary; what the server does with a save is proven through the
 * router in `__tests__/api/trpc/workshop.registration-window.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { WorkshopRegistrationSettings } from './WorkshopRegistrationSettings'
import { NotificationProvider } from './NotificationProvider'

const mutate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({}),
    workshop: {
      admin: {
        updateRegistrationTimes: {
          useMutation: () => ({ mutate, isPending: false }),
        },
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const SPONSOR = '2026-06-01T06:00:00.000Z'
const OFFICIAL = '2026-06-15T06:30:00.000Z'
const END = '2026-07-01T07:00:00.000Z'

const BEFORE_SPONSOR = '2026-05-20T12:00:00.000Z'
const IN_EARLY_ACCESS = '2026-06-10T12:00:00.000Z'
const AFTER_OFFICIAL = '2026-06-20T12:00:00.000Z'
const AFTER_END = '2026-07-02T12:00:00.000Z'

type Times = Parameters<typeof WorkshopRegistrationSettings>[0]

function renderCard(times: Times, now: string) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) })
  return render(
    <NotificationProvider>
      <WorkshopRegistrationSettings {...times} />
    </NotificationProvider>,
  )
}

/** What the card shows next to a row's name. */
const row = (name: string) =>
  screen.getByText(name).nextElementSibling?.textContent

/** The status label an organizer reads for these times, at `now`. */
function statusAt(times: Times, now: string) {
  renderCard(times, now)
  return row('Status')
}

/** The line under the status, which says what a half-set window means. */
const note = () =>
  screen.getByText('Status').parentElement?.nextElementSibling?.textContent

beforeEach(() => mutate.mockReset())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the status label with a sponsor start time', () => {
  const ALL_THREE = {
    workshopRegistrationSponsorStart: SPONSOR,
    workshopRegistrationStart: OFFICIAL,
    workshopRegistrationEnd: END,
  }

  it.each([
    ['before the sponsor start time', BEFORE_SPONSOR, 'Not yet open'],
    [
      'inside the early-access window',
      IN_EARLY_ACCESS,
      'Open for early access',
    ],
    ['at the sponsor start time', SPONSOR, 'Open for early access'],
    ['at the official opening', OFFICIAL, 'Currently open'],
    [
      'from the official opening until the end',
      AFTER_OFFICIAL,
      'Currently open',
    ],
    ['after the end', AFTER_END, 'Closed'],
  ])('%s', (_when, now, label) => {
    expect(statusAt(ALL_THREE, now)).toBe(label)
  })
})

describe('the status label with no early-access window', () => {
  it.each([
    ['no sponsor start time', undefined],
    ['a sponsor start time equal to the official opening', OFFICIAL],
    [
      'a sponsor start time later than the official opening',
      '2026-06-18T06:00:00.000Z',
    ],
  ])('%s: its three states, as before', (_what, sponsorStart) => {
    const times = {
      workshopRegistrationSponsorStart: sponsorStart,
      workshopRegistrationStart: OFFICIAL,
      workshopRegistrationEnd: END,
    }
    expect(statusAt(times, BEFORE_SPONSOR)).toBe('Not yet open')
    cleanup()
    expect(statusAt(times, IN_EARLY_ACCESS)).toBe('Not yet open')
    cleanup()
    expect(statusAt(times, AFTER_OFFICIAL)).toBe('Currently open')
    cleanup()
    expect(statusAt(times, AFTER_END)).toBe('Closed')
  })

  // CHANGED FROM MAIN (#1345): there the card compared the start first and
  // said "Not yet open" for this combination, which Sanity Studio can store.
  it('with an end that has passed and a start still ahead, is closed', () => {
    expect(
      statusAt(
        {
          workshopRegistrationStart: OFFICIAL,
          workshopRegistrationEnd: '2026-05-22T06:00:00.000Z',
        },
        IN_EARLY_ACCESS,
      ),
    ).toBe('Closed')
  })

  it('with no time set, is not configured', () => {
    expect(statusAt({}, IN_EARLY_ACCESS)).toBe('Not configured')
  })
})

describe('the status note when no close date is set', () => {
  const NO_END = {
    workshopRegistrationSponsorStart: SPONSOR,
    workshopRegistrationStart: OFFICIAL,
  }

  it('inside the early-access window, says early access is open and when everyone can sign up', () => {
    expect(statusAt(NO_END, IN_EARLY_ACCESS)).toBe('Partially configured')
    expect(note()).toBe(
      'Early access is open. Registration opens for everyone 15. juni 2026 kl. 08:30. No close date is set, so once open it never closes.',
    )
  })

  it('before the sponsor start time, says when signups open, as before', () => {
    expect(statusAt(NO_END, BEFORE_SPONSOR)).toBe('Partially configured')
    expect(note()).toBe(
      'Signups open 15. juni 2026 kl. 08:30. No close date is set, so once open they never close.',
    )
  })

  it('after the official opening, says signups are open, as before', () => {
    expect(statusAt(NO_END, AFTER_OFFICIAL)).toBe('Partially configured')
    expect(note()).toBe(
      'Signups are open. No close date is set, so they never close.',
    )
  })
})

describe('the sponsor start time on the card', () => {
  it('is shown with the other two, in the conference’s time zone', () => {
    renderCard(
      {
        workshopRegistrationSponsorStart: SPONSOR,
        workshopRegistrationStart: OFFICIAL,
        workshopRegistrationEnd: END,
      },
      IN_EARLY_ACCESS,
    )
    expect(row('Sponsor Early Access Opens')).toBe('1. juni 2026 kl. 08:00')
    expect(row('Registration Opens')).toBe('15. juni 2026 kl. 08:30')
    expect(row('Registration Closes')).toBe('1. juli 2026 kl. 09:00')
  })

  it('reads "Not set" when there is none', () => {
    renderCard(
      { workshopRegistrationStart: OFFICIAL, workshopRegistrationEnd: END },
      IN_EARLY_ACCESS,
    )
    expect(row('Sponsor Early Access Opens')).toBe('Not set')
  })
})

describe('saving the registration times', () => {
  const edit = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit workshop registration' }),
    )
  const field = (name: RegExp) =>
    screen.getByLabelText(name) as HTMLInputElement
  const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  const ALL_THREE = {
    workshopRegistrationSponsorStart: SPONSOR,
    workshopRegistrationStart: OFFICIAL,
    workshopRegistrationEnd: END,
  }

  it('sends the sponsor start time entered as Oslo wall-clock, and not the two it did not change', () => {
    renderCard(
      { workshopRegistrationStart: OFFICIAL, workshopRegistrationEnd: END },
      BEFORE_SPONSOR,
    )
    edit()
    expect(field(/Sponsor Early Access Opens/).value).toBe('')

    fireEvent.change(field(/Sponsor Early Access Opens/), {
      target: { value: '2026-06-01T08:00' },
    })
    save()

    expect(mutate.mock.calls).toEqual([[{ sponsorStartDate: SPONSOR }]])
  })

  it('opens with the stored sponsor start time and sends null once it is cleared', () => {
    renderCard(ALL_THREE, BEFORE_SPONSOR)
    edit()
    expect(field(/Sponsor Early Access Opens/).value).toBe('2026-06-01T08:00')

    fireEvent.change(field(/Sponsor Early Access Opens/), {
      target: { value: '' },
    })
    save()

    expect(mutate.mock.calls).toEqual([[{ sponsorStartDate: null }]])
  })

  it('sends only the end when only the end was changed', () => {
    renderCard(ALL_THREE, BEFORE_SPONSOR)
    edit()

    // 10:00 in Oslo on 2 July is 08:00 UTC.
    fireEvent.change(field(/Registration Closes/), {
      target: { value: '2026-07-02T10:00' },
    })
    save()

    expect(mutate.mock.calls).toEqual([
      [{ endDate: '2026-07-02T08:00:00.000Z' }],
    ])
  })

  it('sends every time that was changed', () => {
    renderCard(ALL_THREE, BEFORE_SPONSOR)
    edit()

    fireEvent.change(field(/Sponsor Early Access Opens/), {
      target: { value: '2026-06-02T08:00' },
    })
    fireEvent.change(field(/Registration Opens/), {
      target: { value: '' },
    })
    save()

    expect(mutate.mock.calls).toEqual([
      [{ sponsorStartDate: '2026-06-02T06:00:00.000Z', startDate: null }],
    ])
  })

  it('takes in a time that changed behind the open form, and does not send it', () => {
    // Opened when no sponsor start time was stored. A colleague sets one, and
    // the card is drawn again with it while the form is still open.
    const { rerender } = renderCard(
      { workshopRegistrationStart: OFFICIAL, workshopRegistrationEnd: END },
      BEFORE_SPONSOR,
    )
    edit()
    expect(field(/Sponsor Early Access Opens/).value).toBe('')
    rerender(
      <NotificationProvider>
        <WorkshopRegistrationSettings {...ALL_THREE} />
      </NotificationProvider>,
    )
    // A field the organizer has not touched shows what is stored.
    expect(field(/Sponsor Early Access Opens/).value).toBe('2026-06-01T08:00')

    fireEvent.change(field(/Registration Closes/), {
      target: { value: '2026-07-02T10:00' },
    })
    save()

    // The sponsor field is what is stored, so it is no change: sending the
    // empty value the form was opened with would erase the colleague's time.
    expect(mutate.mock.calls).toEqual([
      [{ endDate: '2026-07-02T08:00:00.000Z' }],
    ])
  })

  it('keeps a field the organizer changed when the card is drawn again, and still sends it', () => {
    const { rerender } = renderCard(ALL_THREE, BEFORE_SPONSOR)
    edit()
    fireEvent.change(field(/Registration Closes/), {
      target: { value: '2026-07-02T10:00' },
    })
    // A colleague moves the end to 5 July meanwhile.
    rerender(
      <NotificationProvider>
        <WorkshopRegistrationSettings
          {...ALL_THREE}
          workshopRegistrationEnd="2026-07-05T07:00:00.000Z"
        />
      </NotificationProvider>,
    )
    expect(field(/Registration Closes/).value).toBe('2026-07-02T10:00')

    save()

    expect(mutate.mock.calls).toEqual([
      [{ endDate: '2026-07-02T08:00:00.000Z' }],
    ])
  })

  it('with nothing changed, sends nothing and closes the form', async () => {
    renderCard(ALL_THREE, BEFORE_SPONSOR)
    edit()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    save()

    // The form leaves with a transition.
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(mutate.mock.calls).toEqual([])
  })
})
