/**
 * @vitest-environment jsdom
 *
 * A draft saved on the new-proposal page must still be SUBMITTED by the
 * primary button after the "Draft saved" note fades, and a failed withdrawal
 * must keep the dialog (and the typed reason) open with the error in view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Action, Status } from '@/lib/proposal/types'
import type { ProposalInput } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'

const calls: Record<string, unknown[]> = {}
const latestOpts: Record<string, { onSuccess?: (data: unknown) => void }> = {}
let actionFails = false

// Mirrors react-query closely enough: success callbacks run after the click
// handler returns (so they see the latest options), and `error` is state.
function mutation(name: string) {
  return {
    useMutation: (opts?: { onSuccess?: (data: unknown) => void }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [error, setError] = useState<Error | null>(null)
      latestOpts[name] = opts ?? {}
      const run = async (input: unknown) => {
        ;(calls[name] ??= []).push(input)
        await Promise.resolve()
        if (name === 'action' && actionFails) {
          const err = new Error('Withdrawals are closed')
          setError(err)
          throw err
        }
        const data = name === 'create' ? { _id: 'p-new' } : {}
        latestOpts[name].onSuccess?.(data)
        return data
      }
      return {
        isPending: false,
        error,
        reset: () => setError(null),
        mutate: (input: unknown) => void run(input).catch(() => {}),
        mutateAsync: run,
      }
    },
  }
}

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      getEmails: { useQuery: () => ({ data: [] }) },
      update: mutation('speakerUpdate'),
    },
    proposal: {
      create: mutation('create'),
      update: mutation('update'),
      action: mutation('action'),
      removeCoSpeaker: mutation('removeCoSpeaker'),
    },
  },
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ update: vi.fn() }) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/conference/state', () => ({
  isCfpOpen: () => true,
  isWithdrawalCutoffActive: () => false,
}))
vi.mock('@/lib/speaker/validation', () => ({
  validateSpeakerConsent: () => [],
}))
vi.mock('@/components/cfp/SpeakerDetailsForm', () => ({
  SpeakerDetailsForm: () => null,
}))
vi.mock('@/components/proposal/ProposalDetailsForm', () => ({
  ProposalDetailsForm: () => null,
}))
vi.mock('@/components/cfp/ProposalCoSpeaker', () => ({
  ProposalCoSpeaker: () => null,
}))

import { ProposalForm } from '@/components/cfp/ProposalForm'

const speaker = { _id: 'sp-1', name: 'Kari' } as unknown as Speaker
const props = {
  initialProposal: { title: 'My talk' } as unknown as ProposalInput,
  initialSpeaker: speaker,
  currentUserSpeaker: speaker,
  userEmail: 'kari@example.com',
  conference: {} as Conference,
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k]
  actionFails = false
  window.scrollTo = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('ProposalForm', () => {
  it('submits a draft saved on this page after the saved note fades', async () => {
    vi.useFakeTimers()
    render(<ProposalForm {...props} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    })
    expect(calls.create).toEqual([
      expect.objectContaining({ status: Status.draft }),
    ])

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Draft saved successfully.')).toBeNull()

    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(calls.action).toEqual([{ id: 'p-new', action: Action.submit }]),
    )
  })

  it('keeps the withdraw dialog and reason open when withdrawing fails', async () => {
    actionFails = true
    render(
      <ProposalForm
        {...props}
        proposalId="p-1"
        initialStatus={Status.waitlisted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.change(screen.getByLabelText(/reason for withdrawal/i), {
      target: { value: 'Visa denied' },
    })
    const buttons = screen.getAllByRole('button', { name: 'Withdraw' })
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1])
    })

    expect(calls.action).toEqual([
      { id: 'p-1', action: Action.withdraw, reason: 'Visa denied' },
    ])
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Withdrawals are closed',
    )
    expect(screen.getByLabelText(/reason for withdrawal/i)).toHaveValue(
      'Visa denied',
    )
  })
})
