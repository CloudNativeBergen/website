/**
 * @vitest-environment jsdom
 *
 * `ProposalCoSpeaker` is SHARED between the speaker-facing CFP form and the
 * admin proposal modal. The "create profile directly" path fabricates a speaker
 * profile without that person's involvement, so it must appear in the admin
 * context ONLY — the host passes `allowDirectProfileCreation` explicitly.
 *
 * This is affordance, not the control: the server gate is `adminProcedure` on
 * `proposal.addCoSpeakerProfile`, covered in
 * `__tests__/api/trpc/proposal-add-cospeaker-profile.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposalCoSpeaker } from '@/components/cfp/ProposalCoSpeaker'
import { Format } from '@/lib/proposal/types'

const addProfileSpy = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    proposal: {
      addCoSpeakerProfile: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: (input: unknown) => {
            addProfileSpy(input)
            return Promise.resolve({
              speaker: {
                _id: 'sp-new',
                name: 'Nina Co-Speaker',
                email: 'nina@example.com',
              },
              notified: true,
              notificationSkipped: false,
            })
          },
        }),
      },
      invitation: {
        send: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        cancel: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  },
}))

const baseProps = {
  selectedSpeakers: [],
  format: Format.presentation_45,
  proposalId: 'proposal-1',
}

describe('ProposalCoSpeaker direct profile creation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is hidden in the speaker-facing CFP context (prop omitted)', () => {
    render(<ProposalCoSpeaker {...baseProps} />)

    // The invitation path IS offered — so the absence below is about this
    // control, not about the whole component failing to render.
    expect(screen.getByText('Send invitation')).toBeInTheDocument()
    expect(screen.queryByText('Create profile directly')).toBeNull()
    expect(screen.queryByLabelText('Name *')).toBeNull()
  })

  it('is hidden when the host passes it false', () => {
    render(
      <ProposalCoSpeaker {...baseProps} allowDirectProfileCreation={false} />,
    )
    expect(screen.queryByText('Create profile directly')).toBeNull()
  })

  it('is shown in the admin context, and creates the profile', async () => {
    const onSpeakerCreated = vi.fn()
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        onSpeakerCreated={onSpeakerCreated}
      />,
    )

    expect(screen.getByText('Create profile directly')).toBeInTheDocument()
    // The UI must say the profile is made without the person's involvement,
    // and that they can claim it by signing in.
    expect(screen.getByText(/without their\s+involvement/)).toBeInTheDocument()
    expect(
      screen.getByText(/signing in with the email address/),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name *'), {
      target: { value: 'Nina Co-Speaker' },
    })
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'nina@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create profile/ }))

    await waitFor(() =>
      expect(addProfileSpy).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        email: 'nina@example.com',
        title: undefined,
      }),
    )
    expect(onSpeakerCreated).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'sp-new' }),
    )
    expect(
      await screen.findByText(/added as a co-speaker and told by email/),
    ).toBeInTheDocument()
  })

  it('sends no email field when the organizer leaves the address blank', async () => {
    render(<ProposalCoSpeaker {...baseProps} allowDirectProfileCreation />)

    fireEvent.change(screen.getByLabelText('Name *'), {
      target: { value: 'No Email Person' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create profile/ }))

    await waitFor(() =>
      expect(addProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({ email: undefined }),
      ),
    )
  })
})
