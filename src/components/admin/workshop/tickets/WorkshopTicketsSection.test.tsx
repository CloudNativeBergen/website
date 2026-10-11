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
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
import { WorkshopTicketsSection } from './WorkshopTicketsSection'

const h = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn() }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setWorkshopAccess: {
          useMutation: () => ({ mutate: h.mutate, isPending: false }),
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

/** The row of one ticket type. */
const row = (typeName: string) =>
  within(screen.getByText(typeName, { selector: 'span' }).closest('li')!)

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('a list nobody has configured', () => {
  it('says so, and names the types the built-in list lets in', () => {
    section(['Early Bird', SPEAKER, TWO_DAY])

    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(
      screen.getByText('This list is not configured yet.').parentElement,
    ).toHaveTextContent(
      `No ticket type is marked, so the built-in list decides. Holders of “${SPEAKER}” and “${TWO_DAY}” can sign up for workshops, and nobody else can. Marking a type switches the built-in list off.`,
    )
    // Each type shows what the built-in list decides for it.
    expect(
      row(SPEAKER).getByText('Grants workshop access (built-in list)'),
    ).toBeInTheDocument()
    expect(
      row('Early Bird').getByText('No workshop access (built-in list)'),
    ).toBeInTheDocument()
    // Nothing is "not set" before a type is marked.
    expect(screen.queryByText('Needs a decision')).not.toBeInTheDocument()
  })

  it('says nobody can sign up when the built-in list matches no type here', () => {
    section(['Early Bird', 'Late Bird'])

    expect(
      screen.getByText('This list is not configured yet.').parentElement,
    ).toHaveTextContent(
      'It matches none of this conference’s ticket types, so nobody can sign up for workshops until you mark a type.',
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
      `This is the first ticket type marked at this conference.Saving it switches the built-in list off. “${SPEAKER}” and “${TWO_DAY}” currently grant workshop access through that list and will stop unless marked in the same save.`,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Mark this type/ }))

    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [
            { typeName: 'Early Bird', grantsWorkshop: true },
            { typeName: SPEAKER, grantsWorkshop: true },
            { typeName: TWO_DAY, grantsWorkshop: true },
          ],
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
    fireEvent.click(screen.getByRole('button', { name: /^Only this type/ }))

    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: 'Early Bird', grantsWorkshop: true }] }],
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

    const answers = types.map((name) => [
      name,
      row(name).getByText(
        /^(Grants workshop access|No workshop access|Not set)$/,
        { selector: 'span.rounded-full' },
      ).textContent,
    ])
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
      screen.getByRole('status', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      'Needs a decision“Student” and “Late Bird” are not set. Their holders cannot sign up for workshops until you choose an answer below.',
    )
  })

  it('shows no banner when every type has an answer', () => {
    section(['Two-day pass', 'Day pass'], roles.slice(0, 2))

    expect(
      screen.queryByRole('status', { name: 'Needs a decision' }),
    ).not.toBeInTheDocument()
  })

  it('saves an answer straight away while another type still grants', () => {
    section(types, roles)

    fireEvent.click(
      row('Two-day pass').getByRole('button', { name: /^No workshop access/ }),
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }] }],
    ])
  })

  it('asks before unmarking the last granting type, naming the built-in types', () => {
    section(['Two-day pass', SPEAKER], [roles[0]])

    fireEvent.click(
      row('Two-day pass').getByRole('button', { name: /^No workshop access/ }),
    )

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `The built-in list will decide again. It grants workshop access to “${SPEAKER}”, and to no other ticket type.`,
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
      screen.getByRole('status', { name: 'Needs a decision' }),
    ).toHaveTextContent(
      '“Workshop 2025” is saved as granting workshop access, but Checkin.no lists no ticket type with that name. It may have been renamed there.',
    )
  })

  it('is removed in one save that asks for the workshop answer only', () => {
    section(['Two-day pass'], roles)

    remove()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }] }],
    ])
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
        `This leaves no ticket type that grants workshop access.The built-in list will decide again. It grants workshop access to “${SPEAKER}” and “${TWO_DAY}”, and to no other ticket type.`,
      )
    })

    it('writes nothing when the organizer cancels', () => {
      section(['Workshop 2026', SPEAKER], last)

      remove()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(h.mutate).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
      'The ticket types could not be read from Tito.The list cannot be shown or changed until they can. The saved list still decides who can sign up. Reload the page to try again.',
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    // Not the empty list, and not the not-configured state either.
    expect(screen.queryByText(/lists no ticket types/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument()
  })

  it('is told apart from a provider that lists no types', () => {
    section([], [])

    expect(
      screen.getByText('Checkin.no lists no ticket types for this event.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
