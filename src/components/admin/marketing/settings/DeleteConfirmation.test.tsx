/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DeleteConfirmation,
  type DeletionPreview,
} from './DeleteCampaignDialog'

vi.mock('@/lib/trpc/client', () => ({ api: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const preview = (liveLinks: number): DeletionPreview => ({
  campaigns: 1,
  tasks: 3,
  publishedTasks: 0,
  snapshots: 0,
  requiresTypedConfirmation: false,
  liveLinks,
  conferenceTitle: 'CND 2026',
})

describe('DeleteConfirmation live-links warning (#1145)', () => {
  it('announces the warning in the live region that held "checking", and says a manual post may already be out', async () => {
    const props = { onClose: vi.fn(), onConfirm: vi.fn() }
    const view = render(<DeleteConfirmation {...props} />)
    const region = await screen.findByRole('status')
    expect(region.textContent).toBe(
      'Checking Campaigns, Tasks and publications…',
    )

    view.rerender(<DeleteConfirmation {...props} preview={preview(2)} />)
    // The SAME element: a region inserted with its content is not announced.
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toContain('2 short links may already be shared')
    expect(region.textContent).toContain('may already have been posted by hand')
  })

  it('leaves the region empty when no link may be live', async () => {
    const props = { onClose: vi.fn(), onConfirm: vi.fn() }
    render(<DeleteConfirmation {...props} preview={preview(0)} />)
    expect((await screen.findByRole('status')).textContent).toBe('')
  })
})
