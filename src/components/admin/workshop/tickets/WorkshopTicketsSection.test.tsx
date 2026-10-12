/**
 * @vitest-environment jsdom
 *
 * THE "WORKSHOP TICKETS" SECTION OF /admin/workshops (#1332): what it says
 * about a list, and what each action sends to the one save path.
 *
 * The list is the server's (`buildWorkshopTicketList`, which runs the rule the
 * portal runs); these cases hand the section a list the way the page does and
 * assert on the text an organizer reads and on the mutation arguments, which
 * are the thing that reaches the conference document. What those arguments
 * leave stored, and what the portal then decides, is pinned against the real
 * procedure in `__tests__/app/admin/workshop-tickets.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  buildWorkshopTicketList,
  workshopAnswersVersion,
} from '@/lib/workshop/ticket-list'
import {
  WorkshopTicketsSection,
  WorkshopTicketsSkeleton,
} from './WorkshopTicketsSection'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  isPending: false,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setWorkshopAccess: {
          useMutation: () => ({ mutate: h.mutate, isPending: h.isPending }),
        },
      },
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

const SPEAKER = 'Speaker ticket'
const TWO_DAY = 'Workshop + Conference (2 days)'

const section = (
  typeNames: string[],
  roles: Parameters<typeof buildWorkshopTicketList>[1] = [],
) =>
  render(
    <WorkshopTicketsSection
      list={buildWorkshopTicketList(typeNames, roles)}
      providerLabel="Checkin.no"
    />,
  )

/**
 * Every save says which answers the page was showing, so the server can refuse
 * one made from a page that is no longer what is stored.
 */
const basedOn = (roles: Parameters<typeof buildWorkshopTicketList>[1] = []) =>
  workshopAnswersVersion(roles)

/** The row of one ticket type: a group named after it. */
const row = (typeName: string) =>
  within(screen.getByRole('group', { name: typeName }))

/** The answer a row shows: the group's accessible description. */
const answer = (typeName: string) =>
  document.getElementById(
    screen
      .getByRole('group', { name: typeName })
      .getAttribute('aria-describedby')!,
  )!.textContent

beforeEach(() => {
  vi.clearAllMocks()
  h.isPending = false
})
afterEach(cleanup)

describe('a list nobody has configured', () => {
  it('says so, and names the types the built-in list lets in', () => {
    section(['Early Bird', SPEAKER, TWO_DAY])

    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(
      screen.getByText('This list is not configured yet.').parentElement,
    ).toHaveTextContent(
      `No ticket type is set to grant access, so the built-in list decides. Holders of “${SPEAKER}” and “${TWO_DAY}” can sign up for workshops, and nobody else can. Setting a type to grant access switches the built-in list off.`,
    )
    // Each type shows what the built-in list decides for it.
    expect(answer(SPEAKER)).toBe('Grants workshop access (built-in list)')
    expect(answer('Early Bird')).toBe('No workshop access (built-in list)')
    // Nothing is "not set" before a type is marked.
    expect(screen.queryByText('Needs a decision')).not.toBeInTheDocument()
  })

  it('says nobody can sign up when the built-in list matches no type here', () => {
    section(['Early Bird', 'Late Bird'])

    expect(
      screen.getByText('This list is not configured yet.').parentElement,
    ).toHaveTextContent(
      'This list is not configured yet.No ticket type is set to grant access, so the built-in list decides. It matches none of this conference’s ticket types, so nobody can sign up for workshops until a type is set to grant access.',
    )
  })

  it('confirms the first mark, and carries the granted types over in one save', () => {
    section(['Early Bird', SPEAKER, TWO_DAY])

    fireEvent.click(
      row('Early Bird').getByRole('button', {
        name: /^Grants workshop access/,
      }),
    )

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `This is the first ticket type set to grant access.Saving it switches the built-in list off. Holders of “${SPEAKER}” and “${TWO_DAY}” sign up through that list today, and are blocked unless those types are set to grant access in the same save.`,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /^Grant “Early Bird”, keep/ }),
    )

    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [
            { typeName: 'Early Bird', grantsWorkshop: true },
            { typeName: SPEAKER, grantsWorkshop: true },
            { typeName: TWO_DAY, grantsWorkshop: true },
          ],
          basedOn: basedOn(),
        },
      ],
    ])
  })

  it('saves only the one type when the organizer declines the carry-over', () => {
    section(['Early Bird', SPEAKER, TWO_DAY])

    fireEvent.click(
      row('Early Bird').getByRole('button', {
        name: /^Grants workshop access/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Grant “Early Bird” only/ }),
    )

    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [{ typeName: 'Early Bird', grantsWorkshop: true }],
          basedOn: basedOn(),
        },
      ],
    ])
  })
})

describe('a configured list', () => {
  const roles = [
    { typeName: 'Two-day pass', grantsWorkshop: true },
    { typeName: 'Day pass', admits: true, grantsWorkshop: false },
    { typeName: 'Student', admits: true },
    { typeName: SPEAKER, grantsWorkshop: true },
  ]
  const types = ['Two-day pass', 'Day pass', 'Student', 'Late Bird', SPEAKER]

  it('shows each type with one of the three answers', () => {
    section(types, roles)

    expect(screen.queryByText('Not configured')).not.toBeInTheDocument()
    expect(
      screen.queryByText('This list is not configured yet.'),
    ).not.toBeInTheDocument()

    const answers = types.map((name) => [name, answer(name)])
    expect(answers).toEqual([
      ['Two-day pass', 'Grants workshop access'],
      ['Day pass', 'No workshop access'],
      ['Student', 'Not set'],
      ['Late Bird', 'Not set'],
      [SPEAKER, 'Grants workshop access'],
    ])
    // The stored answer is the pressed button; a not-set type has neither.
    expect(
      row('Day pass').getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      row('Student')
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['false', 'false'])
  })

  it('names the not-set types in the banner', () => {
    section(types, roles)

    expect(
      screen.getByRole('region', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      'Needs a decision“Student” and “Late Bird” are not set. Their holders cannot sign up for workshops until you choose an answer below.',
    )
  })

  it('shows the banner only while a type has no answer', () => {
    const banner = () =>
      screen.queryAllByRole('region', { name: 'Needs a decision' })
    // The same two types, first with "Day pass" unanswered...
    const { rerender } = section(
      ['Two-day pass', 'Day pass'],
      roles.slice(0, 1),
    )
    expect(banner().map((b) => b.textContent)).toEqual([
      'Needs a decision“Day pass” is not set. Its holders cannot sign up for workshops until you choose an answer below.',
    ])

    // ...then with every type answered.
    rerender(
      <WorkshopTicketsSection
        list={buildWorkshopTicketList(
          ['Two-day pass', 'Day pass'],
          roles.slice(0, 2),
        )}
        providerLabel="Checkin.no"
      />,
    )
    expect(banner()).toEqual([])
    expect(answer('Day pass')).toBe('No workshop access')
  })

  it('saves an answer straight away while another type still grants', () => {
    section(types, roles)

    fireEvent.click(
      row('Two-day pass').getByRole('button', { name: /^No workshop access/ }),
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
          basedOn: basedOn(roles),
        },
      ],
    ])
  })

  it('asks before unmarking the last granting type, naming the built-in types', () => {
    section(['Two-day pass', SPEAKER], [roles[0]])

    fireEvent.click(
      row('Two-day pass').getByRole('button', { name: /^No workshop access/ }),
    )

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `The built-in list will decide again. Holders of “${SPEAKER}” will be able to sign up for workshops, and nobody else.`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.mutate).not.toHaveBeenCalled()
  })
})

describe('an entry no ticket type matches', () => {
  const roles = [
    { typeName: 'Two-day pass', grantsWorkshop: true },
    { typeName: 'Workshop 2025', admits: true, grantsWorkshop: true },
  ]
  const remove = () =>
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove the entry for "Workshop 2025"',
      }),
    )

  it('is named in the banner, with what it says and why it is listed', () => {
    section(['Two-day pass'], roles)

    expect(
      screen.getByRole('region', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      '“Workshop 2025” is saved as granting workshop access, but Checkin.no lists no ticket type with that name. It may have been renamed there.',
    )
  })

  /**
   * A REMOVAL IS ALWAYS ASKED ABOUT. If the provider keeps the old name on
   * tickets already sold, removing a granting entry locks their holders out.
   */
  it('asks before removing a granting entry, and says who it can lock out', () => {
    section(['Two-day pass'], roles)

    remove()

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This removes the saved answer for “Workshop 2025”.Anyone whose ticket still carries that name will no longer be able to sign up for workshops.',
    )
    // Keeping it is the first and the prominent choice.
    const choices = within(screen.getByRole('alert')).getAllByRole('button')
    expect(choices.map((b) => b.textContent)).toEqual([
      'Keep the entry',
      'Remove it',
    ])
    expect(choices[0].className).toContain('bg-blue-600')
    expect(choices[1].className).not.toContain('bg-blue-600')
  })

  it('says a No entry changes nothing for anyone', () => {
    section(
      ['Two-day pass'],
      [roles[0], { typeName: 'Workshop 2025', grantsWorkshop: false }],
    )

    remove()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This removes the saved answer for “Workshop 2025”.It is set to No, so nobody gains or loses access.',
    )
  })

  it('writes nothing when the organizer keeps the entry, or presses Escape', () => {
    section(['Two-day pass'], roles)

    remove()
    fireEvent.click(screen.getByRole('button', { name: 'Keep the entry' }))
    expect(screen.queryAllByRole('alert')).toEqual([])

    remove()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove it' }), {
      key: 'Escape',
    })
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(h.mutate).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: 'Remove the entry for "Workshop 2025"',
      }),
    ).toHaveFocus()
  })

  it('is removed in one save that asks for the workshop answer only', () => {
    section(['Two-day pass'], roles)

    remove()
    fireEvent.click(screen.getByRole('button', { name: 'Remove it' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
          basedOn: basedOn(roles),
        },
      ],
    ])
  })

  it('takes no second removal while one is on its way', () => {
    h.isPending = true
    section(['Two-day pass'], roles)

    const button = screen.getByRole('button', {
      name: 'Remove the entry for "Workshop 2025"',
    })
    expect(button).toHaveTextContent('Removing…')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)

    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('moves focus to the section heading when its row leaves the page', () => {
    const { rerender } = section(['Two-day pass'], roles)
    const button = screen.getByRole('button', {
      name: 'Remove the entry for "Workshop 2025"',
    })
    button.focus()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Remove it' }))
    expect(button).toHaveFocus()

    // The page refreshes with the entry gone.
    rerender(
      <WorkshopTicketsSection
        list={buildWorkshopTicketList(['Two-day pass'], roles.slice(0, 1))}
        providerLabel="Checkin.no"
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Workshop tickets' }),
    ).toHaveFocus()
  })

  describe('that is the last one granting', () => {
    const last = [
      { typeName: 'Workshop 2025', grantsWorkshop: true },
      { typeName: 'Workshop 2026', grantsWorkshop: false },
    ]

    it('asks first, naming what the built-in list will grant', () => {
      section(['Workshop 2026', SPEAKER, TWO_DAY], last)

      remove()

      expect(h.mutate).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(
        `This leaves no ticket type set to grant access.The built-in list will decide again. Holders of “${SPEAKER}” and “${TWO_DAY}” will be able to sign up for workshops, and nobody else.`,
      )
    })

    it('writes nothing when the organizer cancels, and puts focus back on the action', () => {
      section(['Workshop 2026', SPEAKER], last)

      remove()
      const cancel = screen.getByRole('button', { name: 'Cancel' })
      cancel.focus()
      fireEvent.click(cancel)

      expect(h.mutate).not.toHaveBeenCalled()
      expect(screen.queryAllByRole('alert')).toEqual([])
      expect(
        screen.getByRole('button', {
          name: 'Remove the entry for "Workshop 2025"',
        }),
      ).toHaveFocus()
    })

    it('closes the question when another type starts granting under it', () => {
      const { rerender } = section(['Workshop 2026', SPEAKER], last)
      remove()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This leaves no ticket type set to grant access.',
      )

      // Another row granted "Workshop 2026" and the page refreshed: removing
      // the orphan no longer brings the built-in list back.
      rerender(
        <WorkshopTicketsSection
          list={buildWorkshopTicketList(
            ['Workshop 2026', SPEAKER],
            [last[0], { typeName: 'Workshop 2026', grantsWorkshop: true }],
          )}
          providerLabel="Checkin.no"
        />,
      )

      expect(screen.queryAllByRole('alert')).toEqual([])
      expect(h.mutate).not.toHaveBeenCalled()
    })

    it('removes it with the confirmation the server requires', () => {
      section(['Workshop 2026', SPEAKER], last)

      remove()
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove and use the built-in list',
        }),
      )

      expect(h.mutate.mock.calls).toEqual([
        [
          {
            updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
            allowBuiltInList: true,
            basedOn: basedOn(last),
          },
        ],
      ])
    })
  })
})

describe('a provider that cannot be read', () => {
  it('says so and offers nothing to press', () => {
    render(<WorkshopTicketsSection list={null} providerLabel="Tito" />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The ticket types could not be read from Tito.The list cannot be shown or changed right now. Reload the page to try again.',
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    // Not the empty list, and not the not-configured state either.
    expect(screen.queryByText(/lists no ticket types/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument()
  })

  it('names no cause when it was not the provider that failed', () => {
    render(
      <WorkshopTicketsSection list={null} providerLabel="Tito" causeUnknown />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This list could not be loaded.The list cannot be shown or changed right now. Reload the page to try again.',
    )
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('is told apart from a provider that lists no types', () => {
    section(
      [],
      [
        { typeName: 'Two-day pass', grantsWorkshop: true },
        { typeName: 'Day pass', grantsWorkshop: false },
      ],
    )

    expect(
      screen.getByText(
        'Checkin.no lists no ticket types for this event, so there is nothing to set here.',
      ),
    ).toBeInTheDocument()
    // The read worked, so no error; and with nothing to compare the stored
    // answers against, none is offered for removal.
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(
      screen.queryAllByRole('region', { name: 'Needs a decision' }),
    ).toEqual([])
  })
})

/**
 * WHILE THE TICKET TYPES ARE BEING READ the section keeps the shape it will
 * have, so the workshops under it do not jump when the list arrives.
 */
describe('while the list is loading', () => {
  it('holds the place of the heading and six rows, and says so to a screen reader', () => {
    const { container } = render(<WorkshopTicketsSkeleton />)

    expect(
      screen.getByRole('region', { name: 'Workshop tickets' }),
    ).toHaveAttribute('id', 'workshop-tickets')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the ticket types…',
    )
    // Placeholders only: nothing to read and nothing to press.
    const rows = container.querySelectorAll('ul[aria-hidden] > li')
    expect(rows).toHaveLength(6)
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})
