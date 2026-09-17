/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  invalidate: vi.fn(),
  success: undefined as
    | undefined
    | ((result: { taskId: string; ceilingWarnings: string[] }) => void),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/components/messaging/SpeakerCombobox', () => ({
  SpeakerCombobox: ({
    id,
    onChange,
  }: {
    id: string
    onChange: (value: { _id: string; name: string }) => void
  }) => (
    <select id={id} onChange={() => onChange({ _id: 'speaker', name: 'Ada' })}>
      <option value="">Choose</option>
      <option value="speaker">Ada</option>
    </select>
  ),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      marketing: {
        plan: { get: { invalidate: h.invalidate } },
        campaign: { get: { invalidate: h.invalidate } },
      },
    }),
    sponsor: {
      crm: {
        list: {
          useQuery: () => ({
            data: [
              {
                _id: 'relationship',
                sponsor: { _id: 'sponsor', name: 'Acme' },
              },
            ],
          }),
        },
      },
    },
    marketing: {
      task: {
        create: {
          useMutation: ({ onSuccess }: { onSuccess: typeof h.success }) => {
            h.success = onSuccess
            return { mutate: h.mutate, isPending: false }
          },
        },
      },
    },
  },
}))
import { CreateTask } from './CreateTask'
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
function open() {
  render(<CreateTask campaignId="campaign" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
  fireEvent.change(screen.getByLabelText('Task title'), {
    target: { value: 'My task' },
  })
  fireEvent.change(screen.getByLabelText('Due date and time (Oslo)'), {
    target: { value: '2026-09-18T12:00' },
  })
}
describe('Tasks of every Kind', () => {
  it('creates a single publishing Task by default and a sibling only by opt-in', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate).toHaveBeenLastCalledWith({
      campaignId: 'campaign',
      kind: 'publishing',
      title: 'My task',
      dueAt: '2026-09-18T10:00:00.000Z',
      channel: 'bluesky',
      targetPage: '/tickets',
      alsoCreateSibling: false,
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ alsoCreateSibling: true }),
    )
  })
  it.each(['studioRender', 'eventPageUpdate', 'checklist'])(
    'creates %s with title, due time and instructions',
    (kind) => {
      open()
      fireEvent.change(screen.getByLabelText('Kind'), {
        target: { value: kind },
      })
      fireEvent.change(screen.getByLabelText('Instructions'), {
        target: { value: 'Do this work' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
      expect(h.mutate).toHaveBeenCalledWith({
        campaignId: 'campaign',
        kind,
        title: 'My task',
        dueAt: '2026-09-18T10:00:00.000Z',
        instructions: 'Do this work',
      })
    },
  )
  it.each([
    ['speakerOutreach', 'speaker'],
    ['sponsorOutreach', 'sponsor'],
  ])('uses the existing recipient picker for %s', (kind, subjectId) => {
    open()
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: kind } })
    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: subjectId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate).toHaveBeenCalledWith({
      campaignId: 'campaign',
      kind,
      title: 'My task',
      dueAt: '2026-09-18T10:00:00.000Z',
      targetPage: '/tickets',
      subjectId,
    })
  })
  it('resets Kind and sibling opt-in when the modal is reopened', () => {
    open()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Kind'), {
      target: { value: 'checklist' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(screen.getByLabelText('Kind')).toHaveValue('publishing')
    expect(screen.getByLabelText('Task title')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('shows ceiling warnings before navigating to the created Task', async () => {
    open()
    h.success?.({
      taskId: 'new-task',
      ceilingWarnings: ['Bluesky ceiling exceeded'],
    })
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith('/admin/marketing/tasks/new-task'),
    )
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: 'Bluesky ceiling exceeded',
      }),
    )
    expect(h.notify.mock.invocationCallOrder[0]).toBeLessThan(
      h.push.mock.invocationCallOrder[0],
    )
  })
})
