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
const {
  volunteers,
  listState,
  updateStatusMutate,
  mutation,
  ticketState,
  reminderMutate,
  bulkStatusMutate,
} = vi.hoisted(() => {
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
  const ticketState: {
    data: { available: boolean; statuses: unknown[] } | undefined
  } = { data: undefined }
  const reminderMutate = vi.fn().mockResolvedValue({ sent: 1, failed: [] })
  const bulkStatusMutate = vi.fn().mockResolvedValue({ updated: 2, skipped: 0 })
  return {
    bulkStatusMutate,
    volunteers,
    listState,
    updateStatusMutate,
    mutation,
    ticketState,
    reminderMutate,
  }
})

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
        sendBulkEmail: { useMutation: mutation },
        sendTicketReminder: {
          useMutation: () => ({
            mutateAsync: reminderMutate,
            isPending: false,
          }),
        },
        bulkUpdateStatus: {
          useMutation: () => ({
            mutateAsync: bulkStatusMutate,
            isPending: false,
          }),
        },
        delete: { useMutation: mutation },
        update: { useMutation: mutation },
      },
    },
    tickets: {
      admin: {
        volunteerTicketStatus: {
          useQuery: () => ({
            data: ticketState.data,
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
  ticketState.data = undefined
  reminderMutate.mockClear()
  bulkStatusMutate.mockClear()
})

describe('VolunteerAdminPage', () => {
  it('bulk-approves the selected pending volunteers', async () => {
    renderPage()
    expect(screen.queryByLabelText('Select Alice')).toBeNull()

    fireEvent.click(screen.getByLabelText('Select Peter'))
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select all visible pending' }),
    )
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(bulkStatusMutate).toHaveBeenCalledWith({
        volunteerIds: ['v-pending', 'v-pending-2'],
        status: VolunteerStatus.APPROVED,
      }),
    )
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull())
  })

  it('drops a volunteer approved on its own card from the selection', () => {
    const { rerender } = renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select all visible pending' }),
    )
    expect(screen.getByText('2 selected')).toBeTruthy()

    // The refetch after a single-card approve shows Peter as approved.
    listState.data = volunteers.map((v) =>
      v._id === 'v-pending' ? { ...v, status: 'approved' } : v,
    )
    rerender(
      <NotificationProvider>
        <VolunteerAdminPage />
      </NotificationProvider>,
    )
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('ignores selected volunteers hidden by a filter', async () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select all visible pending' }),
    )
    fireEvent.change(
      screen.getByPlaceholderText('Search volunteers by name, email, task...'),
      { target: { value: 'Peter' } },
    )
    expect(await screen.findByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(bulkStatusMutate).toHaveBeenCalledWith({
        volunteerIds: ['v-pending'],
        status: VolunteerStatus.APPROVED,
      }),
    )
  })

  it('asks before bulk-rejecting', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Select Peter'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(bulkStatusMutate).not.toHaveBeenCalled()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reject Applications' }),
    )
    await waitFor(() =>
      expect(bulkStatusMutate).toHaveBeenCalledWith({
        volunteerIds: ['v-pending'],
        status: VolunteerStatus.REJECTED,
      }),
    )
  })

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

  it('clears filters back to the default that hides rejected', () => {
    listState.data = volunteers.filter(
      (v) => v.status === VolunteerStatus.REJECTED,
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Show Rejected' }))
    expect(screen.getByText('Rita')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.queryByText('Rita')).toBeNull()
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

  it('counts unregistered volunteers and confirms before reminding them', async () => {
    ticketState.data = {
      available: true,
      statuses: [
        { volunteerId: 'v-approved', state: 'invited' },
        { volunteerId: 'v-confirmed', state: 'redeemed' },
        { volunteerId: 'v-pending', state: 'not-invited' },
      ],
    }
    renderPage()

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /Remind to Register Ticket \(1\)/,
      })[0],
    )
    expect(reminderMutate).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send Reminder' }),
    )
    await waitFor(() =>
      expect(reminderMutate).toHaveBeenCalledWith({
        volunteerIds: ['v-approved'],
      }),
    )
  })
})
