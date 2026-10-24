/**
 * @vitest-environment jsdom
 *
 * List defaults (rejected hidden, pending first), the copy-all-emails button,
 * the manual "Mark Confirmed" and "Revert to Approved" actions, the reject
 * confirmation and the unsaved-review-notes warning on the volunteer admin page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { VolunteerStatus } from '@/lib/volunteer/types'

// vi.mock factories are hoisted, so the data they close over must be too.
const { volunteers, listState, updateStatusMutate, mutation } = vi.hoisted(
  () => {
    const volunteers = [
      {
        _id: 'v-confirmed',
        name: 'Carol',
        email: 'carol@example.com',
        status: 'confirmed',
      },
      {
        _id: 'v-approved',
        name: 'Alice',
        email: 'alice@example.com',
        status: 'approved',
      },
      {
        _id: 'v-rejected',
        name: 'Rita',
        email: 'rita@example.com',
        status: 'rejected',
      },
      {
        _id: 'v-pending',
        name: 'Peter',
        email: 'peter@example.com',
        status: 'pending',
      },
      // Same address as Alice, different case: must be deduped when copying.
      {
        _id: 'v-pending-2',
        name: 'Alice Again',
        email: 'Alice@example.com',
        status: 'pending',
      },
    ].map((v) => ({
      ...v,
      submittedAt: '2026-06-01T10:00:00Z',
      preferredTasks: [],
    }))

    const updateStatusMutate = vi.fn().mockResolvedValue({ success: true })

    const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
    const listState: { data: typeof volunteers | undefined } = {
      data: volunteers,
    }
    return { volunteers, listState, updateStatusMutate, mutation }
  },
)

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () =>
      new Proxy(
        {},
        {
          get: () =>
            new Proxy(
              {},
              {
                get: () =>
                  new Proxy({}, { get: () => ({ invalidate: vi.fn() }) }),
              },
            ),
        },
      ),
    volunteer: {
      admin: {
        list: {
          useQuery: () => ({
            data: listState.data,
            isLoading: !listState.data,
            error: null,
          }),
        },
        getById: {
          useQuery: (input: { id: string }) => {
            return {
              data: volunteers.find((v) => v._id === input.id),
              isLoading: false,
              error: null,
            }
          },
        },
        updateStatus: {
          useMutation: () => ({
            mutateAsync: updateStatusMutate,
            isPending: false,
          }),
        },
        sendEmail: { useMutation: mutation },
        delete: { useMutation: mutation },
        update: { useMutation: mutation },
      },
    },
    tickets: {
      admin: {
        volunteerTicketStatus: {
          useQuery: () => ({
            data: undefined,
            isLoading: false,
            isError: false,
          }),
        },
      },
    },
    conference: { updateVolunteerLinks: { useMutation: mutation } },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/volunteers',
}))

import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import VolunteerAdminPage from '@/components/volunteer/VolunteerAdminPage'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const renderPage = () =>
  render(
    <NotificationProvider>
      <VolunteerAdminPage />
    </NotificationProvider>,
  )

afterEach(() => {
  cleanup()
  updateStatusMutate.mockClear()
  listState.data = volunteers
})

describe('VolunteerAdminPage', () => {
  it('hides rejected volunteers by default and lists pending first', () => {
    renderPage()

    expect(screen.queryByText('Rita')).toBeNull()
    const names = ['Peter', 'Alice Again', 'Alice', 'Carol'].map((n) =>
      screen.getByText(n, { exact: true }),
    )
    for (let i = 1; i < names.length; i++) {
      expect(
        names[i - 1].compareDocumentPosition(names[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('copies the deduped emails of the visible volunteers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Copy all 3 emails' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'peter@example.com, Alice@example.com, carol@example.com',
      ),
    )
  })

  it('lets an organizer mark an approved volunteer as confirmed', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Alice', { exact: true }))

    fireEvent.click(
      await screen.findByRole('button', { name: /Mark Confirmed/ }),
    )
    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          volunteerId: 'v-approved',
          status: VolunteerStatus.CONFIRMED,
        }),
      ),
    )
  })

  it('offers to show rejected when every application is rejected', () => {
    listState.data = volunteers.filter(
      (v) => v.status === VolunteerStatus.REJECTED,
    )
    renderPage()

    expect(screen.getByText('The only application is rejected.')).toBeTruthy()
    expect(screen.queryByText('Rita')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Rejected' }))
    expect(screen.getByText('Rita')).toBeTruthy()
  })

  it('shows capitalized status labels in badges', () => {
    renderPage()
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.queryByText('pending')).toBeNull()
  })

  it('shows a placeholder in the stat cards while the list loads', () => {
    listState.data = undefined
    renderPage()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
  })

  it('moves focus to the back button and back to the card', async () => {
    renderPage()
    const card = screen.getByText('Alice', { exact: true }).closest('button')!
    expect(card.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(card)
    const back = screen.getByRole('button', { name: /Back to applications/ })
    await waitFor(() => expect(document.activeElement).toBe(back))
    fireEvent.click(back)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText('Alice', { exact: true }).closest('button'),
      ),
    )
  })

  it('asks before rejecting a volunteer', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Peter', { exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(updateStatusMutate).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Reject the application from Peter?'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reject Application' }))
    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          volunteerId: 'v-pending',
          status: VolunteerStatus.REJECTED,
        }),
      ),
    )
  })

  it('lets an organizer revert a confirmed volunteer to approved', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Carol', { exact: true }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revert to Approved' }),
    )
    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          volunteerId: 'v-confirmed',
          status: VolunteerStatus.APPROVED,
        }),
      ),
    )
  })

  it('warns before discarding unsaved review notes', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Peter', { exact: true }))
    const notes = screen.getByLabelText(/Review Notes/) as HTMLTextAreaElement
    fireEvent.change(notes, { target: { value: 'Great fit' } })

    fireEvent.click(screen.getByText('Alice', { exact: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Review Notes/) as HTMLTextAreaElement).value,
      ).toBe('Great fit'),
    )

    fireEvent.click(screen.getByText('Alice', { exact: true }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard Notes' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Mark Confirmed/ }),
      ).toBeTruthy(),
    )
  })
})
