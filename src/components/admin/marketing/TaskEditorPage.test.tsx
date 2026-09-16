// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import type { TaskEditorData } from '@/lib/marketing/types'
import { TaskEditorPage } from './TaskEditorPage'

const mocks = vi.hoisted(() => ({
  data: null as TaskEditorData | null,
  fetch: vi.fn(),
  attach: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: mocks.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = {
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  }
  return {
    api: {
      useUtils: () => ({
        marketing: {
          task: { get: { fetch: mocks.fetch, invalidate: mocks.invalidate } },
          plan: { get: { invalidate: mocks.invalidate } },
        },
      }),
      marketing: {
        task: {
          get: { useQuery: () => ({ data: mocks.data, isFetching: false }) },
          attachAsset: { useMutation: () => ({ mutateAsync: mocks.attach }) },
          delete: mutation,
          setAssignee: mutation,
          setDate: mutation,
          setPrerequisites: mutation,
          skip: mutation,
          approve: mutation,
        },
      },
      social: {
        unscheduleVariant: mutation,
        scheduleVariant: mutation,
        markPosted: mutation,
      },
    },
  }
})

function pendingData(): TaskEditorData {
  return {
    task: {
      _id: 'render-1',
      _rev: 'r2',
      campaignId: 'campaign-1',
      key: 'render',
      title: 'Render the CFP card',
      kind: 'studioRender',
      channel: null,
      date: null,
      provisional: false,
      milestone: null,
      status: 'open',
      complete: true,
      prerequisiteIds: [],
      variantId: null,
      assigneeId: null,
      approvedAt: null,
      approvedByName: null,
      assigneeName: null,
      targetPage: null,
      instructions: null,
      externalUrl: null,
      skipReason: null,
      subject: null,
      assetUrl: '/saved-render.png',
      assetId: 'image-saved',
      handoffPending: true,
      origin: 'manual',
    },
    campaign: { _id: 'campaign-1', key: 'cfp', title: 'CFP' },
    planOwnerId: null,
    siblings: [],
    variant: null,
    baseUrl: 'https://example.test',
    taggedLink: null,
    pages: [],
    organizers: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.data = pendingData()
  mocks.fetch.mockResolvedValue({
    ...mocks.data,
    task: { ...mocks.data.task, _rev: 'r3', assetId: 'image-latest' },
  })
  mocks.attach.mockResolvedValue({ success: true, handoffFailures: [] })
})
afterEach(cleanup)

describe('Task editor handoff recovery', () => {
  it('recovers server-side pending handoff after a reload using the latest revision and saved asset', async () => {
    const first = render(<TaskEditorPage taskId="render-1" />)
    first.unmount()
    mocks.data = structuredClone(pendingData())
    const reloaded = render(<TaskEditorPage taskId="render-1" />)

    expect(reloaded.container.textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() =>
      expect(mocks.attach).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'r3',
        assetId: 'image-latest',
      }),
    )
    expect(mocks.fetch).toHaveBeenCalledWith(
      { taskId: 'render-1' },
      { staleTime: 0 },
    )
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, handoffPending: false },
    }
    reloaded.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image handoff completed.',
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ taskId: 'render-1' })
  })

  it('bypasses a fresh cached revision when retrying the saved handoff', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    })
    const queryKey = ['marketing.task.get', 'render-1']
    client.setQueryData(queryKey, pendingData())
    const current = {
      ...pendingData(),
      task: { ...pendingData().task, _rev: 'r3' },
    }
    mocks.fetch.mockImplementation((_input, options) =>
      client.fetchQuery({ queryKey, queryFn: async () => current, ...options }),
    )
    mocks.attach.mockImplementation(async (input) => {
      if (input.taskRev !== 'r3') throw new Error('Revision conflict')
      return { success: true, handoffFailures: [] }
    })
    try {
      const page = render(<TaskEditorPage taskId="render-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
      await waitFor(() =>
        expect(mocks.attach).toHaveBeenCalledWith({
          taskId: 'render-1',
          taskRev: 'r3',
          assetId: 'image-saved',
        }),
      )
      mocks.data = {
        ...current,
        task: { ...current.task, handoffPending: false },
      }
      page.rerender(<TaskEditorPage taskId="render-1" />)
      expect((await screen.findByRole('status')).textContent).toBe(
        'Image handoff completed.',
      )
    } finally {
      client.clear()
    }
  })

  it('shows the current pending state after an earlier successful handoff', async () => {
    const page = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled())
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, handoffPending: false },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image handoff completed.',
    )
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, _rev: 'r4' },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    expect(
      screen.getByRole('region', { name: 'Studio render' }).textContent,
    ).toBe(
      'Studio renderOpen the promo studioSkip…' +
        'The render is done and saved. The image has not reached all publishing Tasks listed below yet.' +
        'Prerequisites are advisory: these publishing Tasks can publish without this image until the handoff succeeds.' +
        'Retry handoffRendered; the image is attached to this task.',
    )
  })

  it('keeps the pending state and retry available after a failed retry and another reload', async () => {
    mocks.attach.mockResolvedValue({
      success: true,
      handoffFailures: ['post-1'],
    })
    const first = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Some publishing Tasks still need the image. Retry the handoff again.',
      ),
    )
    first.unmount()
    mocks.data = structuredClone(pendingData())
    render(<TaskEditorPage taskId="render-1" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'Retry handoff',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('shows the publishing organizer the pending image and links to its recovery Task', () => {
    const renderTask = pendingData().task
    mocks.data = {
      ...pendingData(),
      task: {
        ...renderTask,
        _id: 'publish-1',
        title: 'Publish CFP',
        kind: 'publishing',
        status: 'scheduled',
        handoffPending: false,
        prerequisiteIds: ['render-1'],
      },
      siblings: [renderTask],
    }
    const page = render(<TaskEditorPage taskId="publish-1" />)
    expect(page.container.textContent).toContain(
      'This publishing Task can publish without its image while the handoff is pending.',
    )
    expect(
      screen
        .getByRole('link', { name: 'Retry image handoff: Render the CFP card' })
        .getAttribute('href'),
    ).toBe('/admin/marketing/tasks/render-1')
  })
})
