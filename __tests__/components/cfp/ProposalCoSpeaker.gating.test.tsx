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
const remindSpy = vi.fn().mockResolvedValue({ success: true })
const resendSpy = vi
  .fn()
  .mockResolvedValue({ success: true, expiresAt: '2026-06-01T00:00:00Z' })

vi.mock('@/components/SpeakerAvatars', () => ({
  SpeakerAvatars: () => null,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      proposal: {
        invitation: { list: { fetch: vi.fn().mockResolvedValue([]) } },
      },
    }),
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
        remind: {
          useMutation: () => ({ mutateAsync: remindSpy, isPending: false }),
        },
        resend: {
          useMutation: () => ({ mutateAsync: resendSpy, isPending: false }),
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

  // A two-token query with a partial surname is how people actually search.
  // The filter is a plain substring test over the whole display name, so it
  // holds; a GROQ `match` predicate would tokenize and need a trailing wildcard
  // to do the same. Pinned here so nobody moves this filter server-side into a
  // `match` without noticing.
  it.each([
    ['a partial surname', 'Ingrid N'],
    ['a surname alone', 'nilsen'],
    ['a partial address', 'ingrid@ex'],
  ])('matches an existing speaker on %s', async (_label, term) => {
    render(<ProposalCoSpeaker {...baseProps} allowPickExisting />)
    openAddPanel()

    fireEvent.change(screen.getByLabelText('Search by name or email'), {
      target: { value: term },
    })
    expect(
      await screen.findByRole('button', {
        name: 'Add Ingrid Nilsen to this proposal',
      }),
    ).toBeInTheDocument()
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

  /**
   * THE ADDRESS IS REQUIRED (#1045). A search by NAME leaves the create form's
   * email blank, and that form must not be submittable — the person would be
   * on the published programme with nobody told. The server refuses this too
   * (`proposal-add-cospeaker-profile.test.ts`); this is the affordance.
   */
  it('cannot create a profile until an address is given', async () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowPickExisting
        allowDirectProfileCreation
      />,
    )
    openAddPanel()

    fireEvent.change(screen.getByLabelText('Search by name or email'), {
      target: { value: 'Nina Co-Speaker' },
    })
    expect(
      await screen.findByText(/No existing speaker matches/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Create the profile yourself/))

    // The name came from the search; the address did not.
    expect(screen.getByLabelText('Name')).toHaveValue('Nina Co-Speaker')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    const createButton = screen.getByRole('button', { name: /Create profile/ })
    expect(createButton).toBeDisabled()

    // A half-typed address is no address.
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nina@' },
    })
    expect(createButton).toBeDisabled()
    fireEvent.click(createButton)
    expect(addProfileSpy).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nina@example.com' },
    })
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)

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

describe('ProposalCoSpeaker format limit', () => {
  beforeEach(() => vi.clearAllMocks())

  const third = { _id: 'sp-3', name: 'Kari Moen' } as Speaker
  // presentation_45 allows 1 primary + 2 co-speakers; this is one over.
  const overLimit = [primary, coSpeaker, third, { _id: 'sp-4', name: 'Nils' }]

  it('keeps Add available above the limit for an organizer (#1030)', () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        speakers={overLimit as Speaker[]}
        enforceFormatLimit={false}
        allowPickExisting
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Add speaker' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('4 speakers; the format allows 3 at submission.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Limit for this format reached/)).toBeNull()
  })

  it('stops a CFP speaker at the limit, with one sentence and no notice', () => {
    // OVER the limit, not merely at it: an organizer may have added a fourth.
    // At exactly three the over-limit notice would be absent anyway, and the
    // assertion below would pass with the gate removed.
    render(
      <ProposalCoSpeaker {...baseProps} speakers={overLimit as Speaker[]} />,
    )

    expect(screen.queryByRole('button', { name: 'Add speaker' })).toBeNull()
    expect(
      screen.getByText(
        'Limit for this format reached (1 primary + 2 co-speakers).',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/the format allows/)).toBeNull()
  })
})

describe('ProposalCoSpeaker invitation row actions', () => {
  beforeEach(() => vi.clearAllMocks())

  const open = {
    _id: 'inv-open',
    invitedEmail: 'sofia@example.com',
    invitedName: 'Sofia Berg',
    status: 'pending' as const,
    expiresAt: '2099-01-01T00:00:00Z',
  }
  const lapsed = {
    _id: 'inv-lapsed',
    invitedEmail: 'bjorn@example.com',
    invitedName: 'Bjørn Hansen',
    // The read paths report effective status, so a lapsed one arrives expired.
    status: 'expired' as const,
    expiresAt: '2020-01-01T00:00:00Z',
  }

  it('reminds an open invitation through invitation.remind, and offers no Resend', async () => {
    render(<ProposalCoSpeaker {...baseProps} invitations={[open]} />)

    expect(
      screen.queryByRole('button', {
        name: 'Resend the invitation to sofia@example.com',
      }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remind sofia@example.com' }),
    )
    await waitFor(() =>
      expect(remindSpy).toHaveBeenCalledWith({ invitationId: 'inv-open' }),
    )
    expect(resendSpy).not.toHaveBeenCalled()
  })

  it('resends a lapsed invitation through invitation.resend, and offers no Remind', async () => {
    render(<ProposalCoSpeaker {...baseProps} invitations={[lapsed]} />)

    expect(
      screen.queryByRole('button', { name: 'Remind bjorn@example.com' }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Resend the invitation to bjorn@example.com',
      }),
    )
    await waitFor(() =>
      expect(resendSpy).toHaveBeenCalledWith({ invitationId: 'inv-lapsed' }),
    )
    expect(remindSpy).not.toHaveBeenCalled()
  })

  it('replaces Remind with the remaining cooldown', () => {
    const remindedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    render(
      <ProposalCoSpeaker
        {...baseProps}
        invitations={[{ ...open, lastRemindedAt: remindedAt }]}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Remind sofia@example.com' }),
    ).toBeNull()
    expect(screen.getByText(/again in 21h/)).toBeInTheDocument()
  })

  it("shows the server's refusal on the row it belongs to", async () => {
    resendSpy.mockRejectedValueOnce(
      new Error(
        'This person is already a speaker on this proposal and does not need an invitation.',
      ),
    )
    render(<ProposalCoSpeaker {...baseProps} invitations={[lapsed]} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Resend the invitation to bjorn@example.com',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already a speaker on this proposal',
    )
  })
})

/**
 * UPGRADING AN INVITATION into a profile. The button is admin-only affordance
 * and the server refuses a declined invitation whatever the UI offers
 * (`__tests__/api/trpc/proposal-add-cospeaker-profile.test.ts`); what is pinned
 * here is that the operator gets a PREFILLED form rather than a one-click
 * write, and that the invitation id travels with it.
 */
describe('ProposalCoSpeaker upgrade invitation to profile', () => {
  beforeEach(() => vi.clearAllMocks())

  const open = {
    _id: 'inv-open',
    invitedEmail: 'sofia@example.com',
    invitedName: 'Sofia Berg',
    status: 'pending' as const,
    expiresAt: '2099-01-01T00:00:00Z',
  }
  const lapsed = {
    ...open,
    _id: 'inv-lapsed',
    status: 'expired' as const,
    expiresAt: '2020-01-01T00:00:00Z',
  }
  const declined = {
    ...open,
    _id: 'inv-declined',
    status: 'declined' as const,
    expiresAt: '2020-01-01T00:00:00Z',
  }

  const upgradeButton = () =>
    screen.queryByRole('button', {
      name: 'Create a speaker profile for sofia@example.com',
    })

  it('is not offered in the CFP form, where the invitation row still is', () => {
    render(<ProposalCoSpeaker {...baseProps} invitations={[open]} />)

    // The row IS rendered with its own actions, so the absence below is about
    // this control and not about the invitation failing to appear at all.
    expect(
      screen.getByRole('button', { name: 'Remind sofia@example.com' }),
    ).toBeInTheDocument()
    expect(upgradeButton()).toBeNull()
  })

  it.each([
    ['open', open],
    ['expired', lapsed],
  ])('is offered to an organizer on an %s invitation', (_label, invitation) => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        invitations={[invitation]}
      />,
    )
    expect(upgradeButton()).toBeInTheDocument()
  })

  it('is NOT offered on a declined invitation — that answer stands', () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        invitations={[declined]}
      />,
    )

    // The declined row is there, with its Remove action.
    expect(
      screen.getByRole('button', {
        name: 'Cancel the invitation to sofia@example.com',
      }),
    ).toBeInTheDocument()
    expect(upgradeButton()).toBeNull()
  })

  /**
   * `invitation.send` accepts an address whose NFKC form differs from its
   * stored form; `addCoSpeakerProfile` refuses exactly those, because login
   * matches on the folded form and the profile could never be claimed. The
   * upgrade form's address is read-only and must match the invitation, so
   * offering the action here would hand the operator a refusal they cannot act
   * on. Cancel the invitation and use the plain create step instead.
   */
  it('is NOT offered for an address a profile could never be claimed with', () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        invitations={[
          { ...open, invitedEmail: 'oﬃce@example.com' },
          // A plain-ASCII row alongside it, so the absence below is about the
          // address and not about the action having disappeared entirely.
          { ...lapsed, invitedEmail: 'bjorn@example.com' },
        ]}
      />,
    )

    expect(
      screen.queryByRole('button', {
        name: 'Create a speaker profile for oﬃce@example.com',
      }),
    ).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Create a speaker profile for bjorn@example.com',
      }),
    ).toBeInTheDocument()
  })

  it('opens a prefilled form and sends the invitation id, not a one-click write', async () => {
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        allowPickExisting
        invitations={[open]}
      />,
    )

    fireEvent.click(upgradeButton()!)
    // Nothing is written on the click itself.
    expect(addProfileSpy).not.toHaveBeenCalled()

    expect(screen.getByLabelText('Name')).toHaveValue('Sofia Berg')
    expect(screen.getByLabelText('Email')).toHaveValue('sofia@example.com')
    // The address belongs to the invitation; editing it would strand the
    // invitation and the server refuses the mismatch anyway.
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')

    fireEvent.change(screen.getByLabelText('Title (optional)'), {
      target: { value: 'Staff Engineer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create profile/ }))

    await waitFor(() =>
      expect(addProfileSpy).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        name: 'Sofia Berg',
        email: 'sofia@example.com',
        title: 'Staff Engineer',
        fromInvitationId: 'inv-open',
      }),
    )
  })

  it('makes the operator supply a name when the invitation carried none', async () => {
    const nameless = { ...open, invitedName: undefined }
    render(
      <ProposalCoSpeaker
        {...baseProps}
        allowDirectProfileCreation
        invitations={[nameless]}
      />,
    )

    fireEvent.click(upgradeButton()!)
    // NOT derived from the address local part: "sofia" is not somebody's name.
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: /Create profile/ }),
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Sofia Berg' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create profile/ }))

    await waitFor(() =>
      expect(addProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sofia Berg',
          fromInvitationId: 'inv-open',
        }),
      ),
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

  it('removes a not-yet-saved speaker locally, without calling the mutation', async () => {
    const onRemoveSpeaker = vi.fn().mockResolvedValue(undefined)
    const onSpeakersChange = vi.fn()

    render(
      <ProposalCoSpeaker
        {...baseProps}
        speakers={[primary, coSpeaker]}
        // Only the primary is saved server-side; the co-speaker was added
        // from search a moment ago and Update has not run yet.
        persistedSpeakerIds={[primary._id]}
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

    await waitFor(() =>
      expect(onSpeakersChange).toHaveBeenCalledWith([primary]),
    )
    // Calling it would refuse: the server has no such speaker on the proposal.
    expect(onRemoveSpeaker).not.toHaveBeenCalled()
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
