// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useImageAttachment } from '@/components/common/image-capture'
import { StudioTaskProvider } from './StudioTaskProvider'

const mocks = vi.hoisted(() => ({
  task: {
    _id: 'render-1',
    _rev: 'old-rev',
    title: 'Save the date',
    kind: 'studioRender',
    subject: null,
  },
  mutate: vi.fn(),
  refetch: vi.fn(),
  capture: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    marketing: {
      task: {
        get: {
          useQuery: () => ({
            data: { task: mocks.task },
            refetch: mocks.refetch,
          }),
        },
        attachAsset: { useMutation: () => ({ mutateAsync: mocks.mutate }) },
      },
    },
  },
}))
function RenderControl() {
  const context = useImageAttachment()
  return (
    <button
      onClick={() => context?.attach(mocks.capture, 'conference')}
      disabled={!context || context.busy}
    >
      Attach test render
    </button>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.task.kind = 'studioRender'
  mocks.capture.mockResolvedValue(new Blob(['raster'], { type: 'image/png' }))
  mocks.upload.mockResolvedValue({
    ok: true,
    json: async () => ({ assetId: 'image-uploaded', taskRev: 'upload-rev' }),
  })
  mocks.mutate.mockResolvedValue({ success: true, handoffFailures: [] })
  vi.stubGlobal('fetch', mocks.upload)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function setup() {
  render(
    <StudioTaskProvider taskId="render-1">
      <RenderControl />
    </StudioTaskProvider>,
  )
}
describe('Studio Task attachment', () => {
  it('attaches a subjectless render with its Task-bound upload asset and revision', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach test render' }))
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'upload-rev',
        assetId: 'image-uploaded',
      }),
    )
    const [url, request] = mocks.upload.mock.calls[0]
    expect(url).toBe('/api/admin/marketing-studio-image')
    expect(request.body.get('taskId')).toBe('render-1')
    expect(request.body.get('file').type).toBe('image/png')
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image attached. This Task is complete.',
    )
  })
  it('retries a failed handoff using the saved render without recapture or another upload', async () => {
    mocks.mutate.mockResolvedValueOnce({
      success: true,
      handoffFailures: ['post-1'],
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach test render' }))
    const retry = await screen.findByRole('button', {
      name: 'Retry attachment / handoff',
    })
    expect(screen.getByRole('alert').textContent).toContain(
      'The render is saved and this Task is complete',
    )
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(retry)
    await screen.findByRole('status')
    expect(mocks.mutate.mock.calls).toEqual([
      [
        {
          taskId: 'render-1',
          taskRev: 'upload-rev',
          assetId: 'image-uploaded',
        },
      ],
      [
        {
          taskId: 'render-1',
          taskRev: 'upload-rev',
          assetId: 'image-uploaded',
        },
      ],
    ])
    expect(mocks.capture).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('does not offer attachment for a non-render Task', () => {
    mocks.task.kind = 'checklist'
    setup()
    expect(
      (
        screen.getByRole('button', {
          name: 'Attach test render',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe(
      'This Task does not use the promo studio.',
    )
  })
  it('surfaces upload refusal without presenting completion', async () => {
    mocks.upload.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Task not found' }),
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach test render' }))
    await waitFor(() =>
      expect(
        screen.getByText('Render for Task: Save the date').parentElement
          ?.textContent,
      ).toContain('Task not found'),
    )
    expect(mocks.mutate).toHaveBeenCalledTimes(0)
  })
})
