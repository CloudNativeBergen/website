/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/trpc/client', () => ({ api: {} }))

import { TalkPhotosOptOutSwitch } from './TalkPhotosOptOutSwitch'

describe('TalkPhotosOptOutSwitch, self mode', () => {
  it('keeps the saved value when a stale prop re-renders it', async () => {
    const save = vi.fn(async () => {})
    const { rerender } = render(
      <TalkPhotosOptOutSwitch stored={false} save={save} />,
    )
    await act(async () => fireEvent.click(screen.getByRole('checkbox')))
    expect(save).toHaveBeenCalledWith(true)
    await screen.findByText('Saved.')
    // router.refresh() with a CDN read older than the save.
    rerender(<TalkPhotosOptOutSwitch stored={false} save={save} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
