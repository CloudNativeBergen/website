/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
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
  invalidated: [] as string[],
  success: undefined as
    | undefined
    | ((result: { taskId: string; ceilingWarnings: string[] }) => void),
  error: undefined as undefined | ((e: Error) => void),
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
        plan: {
          get: {
            invalidate: (...args: unknown[]) => {
              h.invalidated.push('plan')
              return h.invalidate(...args)
            },
          },
        },
        campaign: {
          get: {
            invalidate: (...args: unknown[]) => {
              h.invalidated.push('campaign')
              return h.invalidate(...args)
            },
          },
        },
        report: {
          invalidate: (...args: unknown[]) => {
            h.invalidated.push('report')
            return h.invalidate(...args)
          },
        },
      },
      social: {
        listVariants: {
          invalidate: (...args: unknown[]) => {
            h.invalidated.push('social')
            return h.invalidate(...args)
          },
        },
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
          useMutation: ({
            onSuccess,
            onError,
          }: {
            onSuccess: typeof h.success
            onError: typeof h.error
          }) => {
            h.success = onSuccess
            h.error = onError
            return { mutate: h.mutate, isPending: false }
          },
        },
      },
    },
  },
}))
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import { CreateTask } from './CreateTask'
const milestones = resolveAllMilestones({
  startDate: '2027-05-01',
  endDate: '2027-05-02',
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
})
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
function open() {
  render(<CreateTask campaignId="campaign" milestones={null} />)
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
  it('invalidates the Report and the Social Posts list too', async () => {
    // The Report derives plan-health totals, Channel aggregates and Task
    // rankings from the Task list. Leaving it out meant a report already loaded
    // when the Task was created served its cached pre-creation figures for the
    // rest of the shared 60-second stale window.
    h.invalidated.length = 0
    open()
    h.success?.({ taskId: 'new-task', ceilingWarnings: [] })
    await waitFor(() => expect(h.push).toHaveBeenCalled())
    expect([...h.invalidated].sort()).toEqual([
      'campaign',
      'plan',
      'report',
      // A publishing Task also creates the draft post and variant.
      'social',
    ])
  })
})

it('refuses to close while a creation is in flight, so it cannot be submitted twice', () => {
  // The form is unmounted when the modal closes, so an organizer who submitted
  // and then dismissed with Escape, the backdrop or the X got a FRESH form on
  // reopening, with no memory of the request still running — and submitting
  // again created the Task, its post and its variant a second time. The first
  // create is atomic, so neither is a partial anyone can clean up.
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
  expect(h.mutate).toHaveBeenCalledTimes(1)

  // Dismissing now is ignored: the form is still there, with what was typed.
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(screen.getByLabelText('Task title')).toHaveValue('My task')

  // A failure releases it, so a genuine error is not a dead end.
  act(() => h.error?.(new Error('offline')))
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByLabelText('Task title')).toBeNull()
})
describe('When: a Milestone anchor or a fixed date', () => {
  function openAnchored() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-01-20T10:00:00Z'))
    render(<CreateTask campaignId="campaign" milestones={milestones} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    fireEvent.change(screen.getByLabelText('Task title'), {
      target: { value: 'My task' },
    })
  }
  afterEach(() => vi.useRealTimers())
  it('starts anchored on today and shows the resolved date live', () => {
    openAnchored()
    // Tomorrow is 11 days before CFP closes (2027-02-01), the nearest Milestone.
    expect(screen.getByLabelText('Milestone')).toHaveValue('CFP_CLOSE')
    expect(screen.getByLabelText('Days from Milestone')).toHaveValue(-11)
    fireEvent.change(screen.getByLabelText('Days from Milestone'), {
      target: { value: '-3' },
    })
    expect(screen.getByText(/29\. januar 2027 at 18:00/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Channel'), {
      target: { value: 'linkedin' },
    })
    expect(screen.getByText(/29\. januar 2027 at 08:00/)).toBeInTheDocument()
  })
  it('sends the anchor and no date', () => {
    openAnchored()
    fireEvent.change(screen.getByLabelText('Milestone'), {
      target: { value: 'CONFERENCE_START' },
    })
    fireEvent.change(screen.getByLabelText('Days from Milestone'), {
      target: { value: '-14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate).toHaveBeenLastCalledWith({
      campaignId: 'campaign',
      kind: 'publishing',
      title: 'My task',
      anchor: { milestone: 'CONFERENCE_START', offsetDays: -14 },
      channel: 'bluesky',
      targetPage: '/tickets',
      alsoCreateSibling: false,
    })
  })
  it('suggests the nearest Milestone for a typed date and anchors on request', () => {
    openAnchored()
    fireEvent.click(screen.getByLabelText('Fixed date'))
    fireEvent.change(screen.getByLabelText('Due date and time (Oslo)'), {
      target: { value: '2027-03-04T12:00' },
    })
    expect(
      screen.getByText(/That is 3 days after Speakers notified\./),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Follow that Milestone instead' }),
    )
    expect(screen.getByLabelText('Milestone')).toHaveValue('CFP_NOTIFY')
    expect(screen.getByLabelText('Days from Milestone')).toHaveValue(3)
  })
  it('still sends a bare date, unanchored, from the fixed-date mode', () => {
    openAnchored()
    fireEvent.click(screen.getByLabelText('Fixed date'))
    fireEvent.change(screen.getByLabelText('Due date and time (Oslo)'), {
      target: { value: '2027-03-04T12:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate).toHaveBeenLastCalledWith({
      campaignId: 'campaign',
      kind: 'publishing',
      title: 'My task',
      dueAt: '2027-03-04T11:00:00.000Z',
      channel: 'bluesky',
      targetPage: '/tickets',
      alsoCreateSibling: false,
    })
  })
  it('keeps the offset within what the server accepts', () => {
    openAnchored()
    fireEvent.change(screen.getByLabelText('Days from Milestone'), {
      target: { value: '900000000' },
    })
    // Leaving the field shows what was kept, not what was typed.
    fireEvent.blur(screen.getByLabelText('Days from Milestone'))
    expect(screen.getByLabelText('Days from Milestone')).toHaveValue(365)
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(h.mutate.mock.calls[0][0].anchor).toEqual({
      milestone: 'CFP_CLOSE',
      offsetDays: 365,
    })
  })
  it('can still follow a Milestone when none is within a year of today', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-20T10:00:00Z'))
    render(<CreateTask campaignId="campaign" milestones={milestones} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(screen.getByLabelText('Milestone')).toHaveValue('CONFERENCE_START')
    expect(screen.getByLabelText('Days from Milestone')).toHaveValue(0)
  })
  it('offers only a fixed date when the conference cannot anchor', () => {
    render(<CreateTask campaignId="campaign" milestones={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(screen.queryByLabelText('Follow a Milestone')).toBeNull()
    expect(screen.getByLabelText('Due date and time (Oslo)')).toBeRequired()
  })
})
