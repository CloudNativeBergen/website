/**
 * @vitest-environment jsdom
 *
 * `ProposalCoSpeaker` is SHARED between the speaker-facing CFP form and the
 * admin proposal modal. Two of its steps are organizer-only:
 *
 * - searching the speaker directory (a CFP submitter must not be able to
 *   browse every speaker), and
 * - creating a profile without that person's involvement.
 *
 * Both sit behind explicit props that default to OFF. This is affordance, not
 * the control: the server gates are `adminProcedure` on `speaker.admin.list`
 * and on `proposal.addCoSpeakerProfile` (the latter covered in
 * `__tests__/api/trpc/proposal-add-cospeaker-profile.test.ts`).
 *
 * It also pins the SINGLE removal path: when a host supplies a persisting
 * `onRemoveSpeaker`, the component must not also mutate the list locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposalCoSpeaker } from '@/components/cfp/ProposalCoSpeaker'
import { Format } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'

const addProfileSpy = vi.fn()
const directoryQuerySpy = vi.fn()

vi.mock('@/components/SpeakerAvatars', () => ({
  SpeakerAvatars: () => null,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: {
        list: {
          useQuery: (_input: unknown, options: { enabled?: boolean }) => {
            directoryQuerySpy(options)
            return {
              data: options?.enabled
                ? [
                    {
                      _id: 'sp-existing',
                      name: 'Ingrid Nilsen',
                      email: 'ingrid@example.com',
                      title: 'SRE',
                      image: null,
                      slug: 'ingrid-nilsen',
                    },
                  ]
                : [],
              isLoading: false,
            }
          },
        },
      },
    },
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
              supersededInvitationIds: [],
            })
          },
        }),
      },
      invitation: {
        send: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
        },
        cancel: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))

const primary = {
  _id: 'sp-primary',
  name: 'Alice Johnson',
  email: 'alice@example.com',
} as Speaker

const coSpeaker = {
  _id: 'sp-co',
  name: 'Erik Larsen',
  email: 'erik@example.com',
} as Speaker

const baseProps = {
  speakers: [primary],
  format: Format.presentation_45,
  proposalId: 'proposal-1',
}

const openAddPanel = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Add speaker' }))

describe('ProposalCoSpeaker admin-only affordances', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives a CFP speaker the invite step only — no search, no direct create', () => {
    render(<ProposalCoSpeaker {...baseProps} />)
    openAddPanel()

    // The invite path IS offered, so the absences below are about these two
    // controls and not about the panel failing to open.
    expect(
      screen.getByRole('button', { name: /Send invitation/ }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Search by name or email')).toBeNull()
    expect(screen.queryByText(/Create the profile yourself/)).toBeNull()
    expect(screen.queryByLabelText('Title (optional)')).toBeNull()

    // The directory query must never run for a speaker.
    expect(directoryQuerySpy).toHaveBeenCalled()
    expect(
      directoryQuerySpy.mock.calls.every(
        ([options]) => options.enabled !== true,
      ),
    ).toBe(true)
  })

  it('keeps both steps hidden when a host passes the props false', () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowPickExisting={false}
        allowDirectProfileCreation={false}
      />,
    )
    openAddPanel()

    expect(screen.queryByLabelText('Search by name or email')).toBeNull()
    expect(screen.queryByText(/Create the profile yourself/)).toBeNull()
  })

  it('offers an organizer search first, and direct creation only after it finds nothing', async () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowPickExisting
        allowDirectProfileCreation
      />,
    )
    openAddPanel()

    const search = screen.getByLabelText('Search by name or email')
    // Neither the invite form nor the create link is reachable before a search.
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByText(/Create the profile yourself/)).toBeNull()

    fireEvent.change(search, { target: { value: 'Ingrid' } })
    expect(
      await screen.findByRole('button', {
        name: 'Add Ingrid Nilsen to this proposal',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Create the profile yourself/)).toBeNull()

    fireEvent.change(search, { target: { value: 'nina@example.com' } })
    expect(
      await screen.findByText(/No existing speaker matches/),
    ).toBeInTheDocument()
    // The searched address is carried into the invite form, not retyped.
    expect(screen.getByLabelText('Email')).toHaveValue('nina@example.com')

    fireEvent.click(screen.getByText(/Create the profile yourself/))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Nina Co-Speaker' },
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
  })
})

describe('ProposalCoSpeaker removal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the persisting path only — never also trimming the list locally', async () => {
    const onRemoveSpeaker = vi.fn().mockResolvedValue(undefined)
    const onSpeakersChange = vi.fn()

    render(
      <ProposalCoSpeaker
        {...baseProps}
        speakers={[primary, coSpeaker]}
        onRemoveSpeaker={onRemoveSpeaker}
        onSpeakersChange={onSpeakersChange}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Erik Larsen from this proposal',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(onRemoveSpeaker).toHaveBeenCalledWith('sp-co'))
    expect(onSpeakersChange).not.toHaveBeenCalled()
  })

  it('does not offer to remove the primary speaker', () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        speakers={[primary, coSpeaker]}
        onRemoveSpeaker={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', {
        name: 'Remove Alice Johnson from this proposal',
      }),
    ).toBeNull()
    expect(screen.getByText('Primary')).toBeInTheDocument()
  })
})
