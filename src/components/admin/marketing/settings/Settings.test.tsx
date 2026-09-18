/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { CampaignEditorForm } from './CampaignEditor'
import { DeleteConfirmation } from './DeleteCampaignDialog'
import { emptyCampaign } from './editor-model'
afterEach(cleanup)

describe('Campaign editing confirmation', () => {
  it('holds a changed measured window until its warning is confirmed', async () => {
    const save = vi.fn()
    render(
      <CampaignEditorForm
        campaign={{
          ...emptyCampaign.window,
          ...emptyCampaign,
          _id: 'campaign',
          _rev: 'rev',
          key: 'stable',
          title: 'CFP',
          primaryOutcome: 'cfpSubmissions',
        }}
        onClose={vi.fn()}
        onSave={save}
      />,
    )
    fireEvent.change(screen.getAllByLabelText('Days from Milestone')[0], {
      target: { value: '-40' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Campaign' }))
    const confirm = await screen.findByRole('button', {
      name: 'Save window change',
    })
    expect(confirm.textContent).toBe('Save window change')
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'CFP',
          window: expect.objectContaining({ startOffsetDays: -40 }),
        }),
        // The Campaign the form MOUNTED with, so the save's compare-and-set
        // uses that revision rather than whatever a refetch has since brought.
        expect.objectContaining({ _id: 'campaign', _rev: 'rev' }),
      ),
    )
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('waits for the Outcome page instead of round-tripping to a server refusal', async () => {
    // `emptyCampaign`'s default Outcome is `attributedSessions`, which is
    // measured against a page, and the page starts null — so the natural path
    // (Add Campaign, type a title, Save) always came back as
    // "Choose the page this Outcome measures."
    render(
      <CampaignEditorForm
        campaign={undefined}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Ticket push' },
    })
    const save = screen.getByRole('button', { name: 'Save Campaign' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Outcome page/), {
      target: { value: '/tickets' },
    })
    expect(save).toBeEnabled()
  })
  it('itemises server counts and enables deletion only after typed confirmation matches', () => {
    const confirm = vi.fn()
    render(
      <DeleteConfirmation
        preview={{
          campaigns: 1,
          tasks: 7,
          publishedTasks: 3,
          snapshots: 20,
          requiresTypedConfirmation: true,
          conferenceTitle: 'My Conference',
        }}
        onClose={vi.fn()}
        onConfirm={confirm}
      />,
    )
    expect(
      screen.getByText('1 Campaigns and 7 Tasks permanently deleted')
        .textContent,
    ).toBe('1 Campaigns and 7 Tasks permanently deleted')
    expect(
      screen.getByRole('button', { name: 'Delete Campaign' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type “My Conference” to confirm'), {
      target: { value: 'My Conference' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Campaign' }))
    expect(confirm).toHaveBeenCalledWith('My Conference')
  })
})
