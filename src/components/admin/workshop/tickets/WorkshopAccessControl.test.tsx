/**
 * @vitest-environment jsdom
 *
 * MARKING WORKSHOP ACCESS for one ticket type. The control moved from the
 * ticket-type card to the "Workshop tickets" section of /admin/workshops
 * (#1332); a conference without the workshops feature still gets it on the
 * card, which is the layout these cases render.
 *
 * `grantsWorkshop` is ACCESS CONTROL: it decides who may open /workshop and who
 * is emailed the sign-in instructions. And it has a cliff — the FIRST type
 * declared anywhere at a conference switches `@/lib/workshop/eligibility` off
 * the historical list of type names, so every type that was granting access
 * through that list stops unless it is declared in the same breath.
 *
 * What is pinned here is exactly that: the cliff is named BEFORE the click, by
 * type name; the safe carry-over is offered as the first option; and the
 * mutation arguments carry what the chosen option said they would — the
 * arguments being the thing that reaches the conference document.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import {
  WorkshopAccessControl,
  type WorkshopAccessControlProps,
} from './WorkshopAccessControl'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  isPending: false,
  /** The hook's own callbacks, so a case can land the save it sent. */
  options: {} as { onSuccess?: () => void; onError?: (e: Error) => void },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setWorkshopAccess: {
          useMutation: (options: typeof h.options) => {
            h.options = options
            return { mutate: h.mutate, isPending: h.isPending }
          },
        },
      },
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))

/**
 * One ticket type as the server-built list hands it to the control
 * (`buildWorkshopTicketList`). Written out by hand so each case states exactly
 * what the control was told; the list builder has its own tests.
 */
function props({
  typeName,
  configured,
  stored,
  builtInGrantsThis = false,
  others = [],
  setToNo = [],
  lastGranting = false,
  builtInGranted = [],
}: {
  typeName: string
  configured: boolean
  stored?: boolean
  builtInGrantsThis?: boolean
  others?: string[]
  /** Other types the built-in list lets in although they hold a stored No. */
  setToNo?: string[]
  lastGranting?: boolean
  builtInGranted?: string[]
}): WorkshopAccessControlProps {
  return {
    type: {
      typeName,
      access: configured
        ? stored === true
          ? 'granted'
          : stored === false
            ? 'denied'
            : 'unclassified'
        : builtInGrantsThis
          ? 'granted'
          : 'denied',
      ...(stored !== undefined && { stored }),
      lastGranting,
      builtInGrants: builtInGrantsThis,
      builtInGrantedOthers: others,
      builtInGrantedOthersSetToNo: setToNo,
    },
    configured,
    builtInGranted,
  }
}

const SPEAKER = 'Speaker ticket'
const TWO_DAY = 'Workshop + Conference (2 days)'
const UPGRADE = 'Sponsor discount (workshop upgrade)'

beforeEach(() => {
  vi.clearAllMocks()
  h.isPending = false
})
afterEach(cleanup)

describe('a conference still on the built-in list', () => {
  const onBridge = props({
    typeName: SPEAKER,
    configured: false,
    builtInGrantsThis: true,
    others: [TWO_DAY, UPGRADE],
  })

  it('names the types that would lose access, before any click', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    expect(screen.getByText('Built-in list')).toBeInTheDocument()
    const warning = screen.getByText(/also grants access to/)
    expect(warning).toHaveTextContent(TWO_DAY)
    expect(warning).toHaveTextContent(UPGRADE)
    expect(warning).toHaveTextContent(/stop granting access unless they are/)
  })

  it('confirms the first declaration instead of writing it', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(h.mutate).not.toHaveBeenCalled()
    expect(
      screen.getByText(/first ticket type set to grant access/),
    ).toBeInTheDocument()
    expect(screen.getByText(/are blocked unless/)).toHaveTextContent(TWO_DAY)
  })

  it('carries the currently-granting types over in ONE mutation', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Grant “Speaker ticket”, keep/ }),
    )

    expect(h.mutate).toHaveBeenCalledTimes(1)
    expect(h.mutate).toHaveBeenCalledWith({
      updates: [
        { typeName: SPEAKER, grantsWorkshop: true },
        { typeName: TWO_DAY, grantsWorkshop: true },
        { typeName: UPGRADE, grantsWorkshop: true },
      ],
    })
  })

  /** The unsafe option stays available — and says what it costs. */
  it('writes this type alone when the organizer insists', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    const only = screen.getByRole('button', {
      name: /^Grant “Speaker ticket” only/,
    })
    expect(only).toHaveTextContent(TWO_DAY)
    fireEvent.click(only)

    expect(h.mutate).toHaveBeenCalledWith({
      updates: [{ typeName: SPEAKER, grantsWorkshop: true }],
    })
  })

  it('cancels without writing anything', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(h.mutate).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/first ticket type set to grant access/),
    ).not.toBeInTheDocument()
  })

  /**
   * THE DENIAL TRAP: a lone `false` declares nothing, so the conference stays
   * on the historical list — which still grants this very type. Saying "no" and
   * having nothing happen is the failure this confirm exists to prevent.
   */
  it('explains that denying alone revokes nothing, and offers the write that does', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))
    expect(h.mutate).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: /^Block “Speaker ticket”, keep/ }),
    )
    expect(h.mutate).toHaveBeenCalledWith({
      updates: [
        { typeName: SPEAKER, grantsWorkshop: false },
        { typeName: TWO_DAY, grantsWorkshop: true },
        { typeName: UPGRADE, grantsWorkshop: true },
      ],
    })
  })

  /** Nothing to strand, nothing to confirm: the click writes. */
  it('writes straight through when no other type grants access', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: SPEAKER, configured: false })}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(h.mutate).toHaveBeenCalledWith({
      updates: [{ typeName: SPEAKER, grantsWorkshop: true }],
    })
  })
})

describe('a conference that has declared workshop access', () => {
  it('writes without a confirm — the cliff is behind it', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: UPGRADE, configured: true, stored: false })}
      />,
    )

    expect(screen.queryByText(/built-in list/i)).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(h.mutate).toHaveBeenCalledWith({
      updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
    })
  })

  /** A type nobody declared is neither in nor out — an organizer must answer. */
  it('says an undeclared type sends its holders to an organizer', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: 'Mystery pass', configured: true })}
      />,
    )

    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.getByText(/told to contact an organizer/)).toBeInTheDocument()
  })

  /**
   * THE CARRY-OVER IS A WRITE TO OTHER CARDS. The safe option declares several
   * types in one mutation, so the carried cards learn their new answer from the
   * `router.refresh()` that follows — not from a click of their own. A card
   * that only reads its prop at mount keeps saying "Not set", with neither
   * button pressed, and the flow that exists to stop an organizer stranding
   * types looks like it failed.
   */
  it('adopts the carried-over declaration the refresh brings back', () => {
    const { rerender } = render(
      <WorkshopAccessControl
        {...props({
          typeName: TWO_DAY,
          configured: false,
          builtInGrantsThis: true,
          others: [SPEAKER],
        })}
      />,
    )
    expect(screen.getByText('Built-in list')).toBeInTheDocument()

    // Another card saved, carrying this one; the refreshed page says so.
    rerender(
      <WorkshopAccessControl
        {...props({ typeName: TWO_DAY, configured: true, stored: true })}
      />,
    )

    expect(screen.getByText('Set')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.queryByText(/told to contact an organizer/),
    ).not.toBeInTheDocument()
  })

  /** ...but never over the answer this organizer is in the middle of saving. */
  it('keeps its own unsaved answer while its write is in flight', () => {
    const { rerender } = render(
      <WorkshopAccessControl
        {...props({ typeName: TWO_DAY, configured: true })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))
    expect(h.mutate).toHaveBeenCalled()

    h.isPending = true
    rerender(
      <WorkshopAccessControl
        {...props({ typeName: TWO_DAY, configured: true, stored: true })}
      />,
    )

    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * THE CLIFF IN THE OTHER DIRECTION (#1332). The built-in list decides
   * whenever nothing is marked, so a no for the last granting type changes who
   * gets in for every type at once. The server names which type that is and
   * which types the built-in list grants.
   */
  describe('the last type that grants', () => {
    const last = {
      typeName: TWO_DAY,
      configured: true,
      stored: true,
      lastGranting: true,
      builtInGranted: [SPEAKER, TWO_DAY],
    }
    const no = () =>
      fireEvent.click(
        screen.getByRole('button', { name: /^No workshop access/ }),
      )

    it('asks before unmarking it, naming what the built-in list will grant', () => {
      render(<WorkshopAccessControl {...props(last)} />)

      no()

      expect(h.mutate).not.toHaveBeenCalled()
      const question = screen.getByRole('alert')
      expect(question).toHaveTextContent(
        'This leaves no ticket type set to grant access.',
      )
      expect(question).toHaveTextContent(
        `The built-in list will decide again. Holders of “${SPEAKER}” and “${TWO_DAY}” will be able to sign up for workshops, and nobody else.`,
      )
    })

    it('says nobody gets in when the built-in list matches none of the types', () => {
      render(
        <WorkshopAccessControl {...props({ ...last, builtInGranted: [] })} />,
      )

      no()

      expect(screen.getByRole('alert')).toHaveTextContent(
        'It matches none of this conference’s ticket types, so nobody will be able to sign up for workshops.',
      )
    })

    it('writes nothing when the organizer cancels', () => {
      render(<WorkshopAccessControl {...props(last)} />)

      no()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(h.mutate).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // The answer on screen is still the stored one.
      expect(
        screen.getByRole('button', { name: /^Grants workshop access/ }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('saves with the confirmation the server requires', () => {
      render(<WorkshopAccessControl {...props(last)} />)

      no()
      fireEvent.click(
        screen.getByRole('button', { name: 'Save and use the built-in list' }),
      )

      expect(h.mutate).toHaveBeenCalledTimes(1)
      expect(h.mutate.mock.calls[0][0]).toStrictEqual({
        updates: [{ typeName: TWO_DAY, grantsWorkshop: false }],
        allowBuiltInList: true,
      })
    })

    it('asks nothing when another type still grants', () => {
      render(
        <WorkshopAccessControl {...props({ ...last, lastGranting: false })} />,
      )

      no()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // And the save does not carry a confirmation nobody gave.
      expect(h.mutate.mock.calls[0][0]).toStrictEqual({
        updates: [{ typeName: TWO_DAY, grantsWorkshop: false }],
      })
    })

    it('asks nothing when marking the last granting type again', () => {
      render(<WorkshopAccessControl {...props(last)} />)

      fireEvent.click(
        screen.getByRole('button', { name: /^Grants workshop access/ }),
      )

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(h.mutate.mock.calls[0][0]).toStrictEqual({
        updates: [{ typeName: TWO_DAY, grantsWorkshop: true }],
      })
    })
  })

  it('is reversible without Studio', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: SPEAKER, configured: true, stored: true })}
      />,
    )

    expect(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))
    expect(h.mutate).toHaveBeenCalledWith({
      updates: [{ typeName: SPEAKER, grantsWorkshop: false }],
    })
  })
})

/**
 * A NO WHILE NOTHING IS MARKED (#1332 review). Only a mark takes a conference
 * off the built-in list, so a lone no for a type that list grants is stored
 * and changes nothing: the type keeps granting, and so does every other type
 * on the list. The question and the notification used to say the opposite
 * ("switches the built-in list off", "X loses workshop access", "no longer
 * grants"). They now say what the save does.
 */
describe('a no while nothing is marked', () => {
  const onBuiltInList = props({
    typeName: SPEAKER,
    configured: false,
    builtInGrantsThis: true,
    others: [TWO_DAY],
  })
  const no = () =>
    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))

  it('says the no changes nothing on its own, and how to make it count', () => {
    render(<WorkshopAccessControl {...onBuiltInList} />)

    no()

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `This No won’t block “${SPEAKER}” yet.Until a ticket type is set to grant access, the built-in list decides, and it lets “${SPEAKER}” holders sign up. Set “${TWO_DAY}” to grant access in the same save and the No takes effect.`,
    )
    // Nothing on screen claims a type loses access or that the list goes off
    // by itself.
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Grants workshop access',
      'No workshop access',
      `Block “${SPEAKER}”, keep “${TWO_DAY}”`,
      'Save the No, block nothing yet',
      'Cancel',
    ])
  })

  it('tells the organizer the built-in list still decides after a lone no', () => {
    render(<WorkshopAccessControl {...onBuiltInList} />)

    no()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save the No, block nothing yet' }),
    )
    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: SPEAKER, grantsWorkshop: false }] }],
    ])
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'success',
          title: 'Workshop access saved',
          message: `Saved, but “${SPEAKER}” holders can still sign up until a ticket type is set to grant access.`,
        },
      ],
    ])
  })

  it('says the type no longer grants when the no is saved with a mark', () => {
    render(<WorkshopAccessControl {...onBuiltInList} />)

    no()
    fireEvent.click(
      screen.getByRole('button', { name: /^Block “Speaker ticket”, keep/ }),
    )
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls[0][0].message).toBe(
      `“${SPEAKER}” does not grant workshop access. 1 other ticket type keeps it.`,
    )
  })

  /**
   * The last type set to grant access is answered No. The built-in list
   * decides again, so what the organizer is told depends on whether that list
   * lets this type in: said by the server (`builtInGrants`), not guessed.
   */
  it.each([
    [
      true,
      `Saved, but “${TWO_DAY}” holders can still sign up until a ticket type is set to grant access.`,
    ],
    [
      false,
      'Saved. No ticket type is set to grant access, so the built-in list decides who can sign up.',
    ],
  ])(
    'after the last grant is taken away (built-in list lets the type in: %s)',
    (builtInGrantsThis, message) => {
      render(
        <WorkshopAccessControl
          {...props({
            typeName: TWO_DAY,
            configured: true,
            stored: true,
            lastGranting: true,
            builtInGrantsThis,
            builtInGranted: builtInGrantsThis ? [TWO_DAY] : [],
          })}
        />,
      )

      no()
      fireEvent.click(
        screen.getByRole('button', { name: 'Save and use the built-in list' }),
      )
      act(() => h.options.onSuccess!())

      expect(h.notify.mock.calls[0][0].message).toBe(message)
    },
  )

  it('says the same of a No for a type the built-in list does not let in', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: 'Early Bird', configured: false })}
      />,
    )

    // Nothing to overrule, so nothing to ask.
    no()
    expect(screen.queryAllByRole('alert')).toEqual([])
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls[0][0].message).toBe(
      'Saved. No ticket type is set to grant access, so the built-in list decides who can sign up.',
    )
  })

  it('has no carry-over to offer when no other type is let in', () => {
    render(
      <WorkshopAccessControl
        {...props({
          typeName: SPEAKER,
          configured: false,
          builtInGrantsThis: true,
        })}
      />,
    )

    no()

    expect(screen.getByRole('alert')).toHaveTextContent(
      `This No won’t block “${SPEAKER}” yet.Until a ticket type is set to grant access, the built-in list decides, and it lets “${SPEAKER}” holders sign up. The No takes effect once a ticket type is set to grant access.`,
    )
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Grants workshop access',
      'No workshop access',
      'Save the No, block nothing yet',
      'Cancel',
    ])
  })

  it('says a No for a type that never granted does not grant', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: 'Mystery pass', configured: true })}
      />,
    )

    no()
    act(() => h.options.onSuccess!())

    // Not "no longer": it was not set, and its holders were refused already.
    expect(h.notify.mock.calls[0][0].message).toBe(
      '“Mystery pass” does not grant workshop access.',
    )
  })

  it('says a marked type grants', () => {
    render(
      <WorkshopAccessControl
        {...props({ typeName: UPGRADE, configured: true, stored: false })}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls[0][0].message).toBe(
      `“${UPGRADE}” now grants workshop access.`,
    )
  })
})

describe('while a save is on its way', () => {
  const row = {
    ...props({ typeName: UPGRADE, configured: true, stored: false }),
    row: true,
  }

  it('refreshes the page once the save has landed', () => {
    render(<WorkshopAccessControl {...row} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    expect(h.refresh).not.toHaveBeenCalled()
    act(() => h.options.onSuccess!())

    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  /**
   * THE WRITE HAS LANDED, THE PAGE HAS NOT. Between the two the row still
   * shows the answers of the old page, and a click would be decided from
   * them. The refresh is held open here (the router's refresh returns a
   * promise this case settles), so the row is exercised in exactly that
   * window.
   */
  it('stays unavailable until the refreshed page is in', async () => {
    let pageIsIn!: () => void
    h.refresh.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        pageIsIn = resolve
      }),
    )
    render(<WorkshopAccessControl {...row} />)
    const group = () => screen.getByRole('group', { name: UPGRADE })
    const unavailable = () =>
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-disabled'))

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    expect(h.mutate).toHaveBeenCalledTimes(1)
    await act(async () => h.options.onSuccess!())

    expect(group()).toHaveAccessibleDescription('Saving…')
    expect(unavailable()).toEqual(['true', 'true'])
    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))
    expect(h.mutate).toHaveBeenCalledTimes(1)

    await act(async () => pageIsIn())

    expect(unavailable()).toEqual(['false', 'false'])
    expect(group()).toHaveAccessibleDescription('No workshop access')
  })

  it('shows the row as saving and takes no second answer', () => {
    h.isPending = true
    render(<WorkshopAccessControl {...row} />)

    // Not the stale answer ("No workshop access"): the row says it is saving.
    expect(
      screen.getByRole('group', { name: UPGRADE }),
    ).toHaveAccessibleDescription('Saving…')
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
    ])
    for (const button of buttons) fireEvent.click(button)
    expect(h.mutate).not.toHaveBeenCalled()
  })

  /**
   * THE PAGE WAS STALE. The server refuses a save based on answers that are
   * no longer the stored ones (and one that would lose the last grant
   * unasked, which only a stale page sends). The organizer is told the list
   * changed, and the page reloads itself.
   */
  it.each(['CONFLICT', 'PRECONDITION_FAILED'])(
    'says the list changed and reloads it when the server answers %s',
    (code) => {
      render(<WorkshopAccessControl {...row} basedOn="v1" />)

      fireEvent.click(
        screen.getByRole('button', { name: /^Grants workshop access/ }),
      )
      // The save said which answers the page was showing.
      expect(h.mutate.mock.calls).toEqual([
        [
          {
            updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
            basedOn: 'v1',
          },
        ],
      ])
      act(() =>
        h.options.onError!(
          Object.assign(new Error('refused'), { data: { code } }),
        ),
      )

      expect(h.notify.mock.calls).toEqual([
        [
          {
            type: 'error',
            title: 'This list changed since you opened it',
            message:
              'Nothing was saved. The list has been reloaded: check it and try again.',
          },
        ],
      ])
      expect(h.refresh).toHaveBeenCalledTimes(1)
      // The optimistic answer is taken back.
      expect(
        screen.getByRole('button', { name: /^No workshop access/ }),
      ).toHaveAttribute('aria-pressed', 'true')
    },
  )

  it('puts the stored answer back when the server refuses the save', () => {
    render(<WorkshopAccessControl {...row} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    expect(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    // An answer from the server that says no: nothing was written.
    act(() =>
      h.options.onError!(
        Object.assign(new Error('You may not edit this conference.'), {
          data: { code: 'FORBIDDEN' },
        }),
      ),
    )

    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'error',
          title: 'Could not save',
          message: 'You may not edit this conference.',
        },
      ],
    ])
    expect(h.refresh).not.toHaveBeenCalled()
  })

  /**
   * NOBODY KNOWS WHETHER IT WAS SAVED. The server could not confirm its write
   * (`BAD_GATEWAY`), or the request got no answer at all. The change may have
   * been stored, so the page must not say "Nothing was saved", must not say
   * "Could not save", and must not print the transport's own words.
   */
  const unknownOutcomeOf = (error: Error) => {
    render(<WorkshopAccessControl {...row} basedOn="v1" />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    act(() => h.options.onError!(error))
  }

  it('says the outcome is unknown, and reloads the list, when the server could not confirm its write', () => {
    unknownOutcomeOf(
      Object.assign(new Error('The save could not be confirmed.'), {
        data: { code: 'BAD_GATEWAY' },
      }),
    )

    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'warning',
          title: 'This change may or may not have been saved',
          message:
            'The save could not be confirmed. Check the list before trying again.',
        },
      ],
    ])
    // The server answered, so it can be asked what is stored.
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  /**
   * ON A TICKET-TYPE CARD the control is built from the CACHED conference
   * (it gets no `basedOn`). The server busts that cache after an unconfirmed
   * save, but the request that follows can still be served the old copy, so
   * what the refresh shows is not known to be what is stored. "Check the
   * list" would vouch for it; the card says to reload the page.
   */
  it('says to reload the page after an unconfirmed save on a ticket-type card', () => {
    render(<WorkshopAccessControl {...row} row={false} />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    act(() =>
      h.options.onError!(
        Object.assign(new Error('The save could not be confirmed.'), {
          data: { code: 'BAD_GATEWAY' },
        }),
      ),
    )

    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'warning',
          title: 'This change may or may not have been saved',
          message:
            'The save could not be confirmed. Reload the page and check the list before trying again.',
        },
      ],
    ])
    // The server answered, so the page data is still refreshed.
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  /**
   * NO ANSWER AT ALL: the connection is likely down. A refresh would fail the
   * same way, and in Next 16 a failed refresh falls back to a browser
   * navigation, which the service worker answers with the offline page: the
   * list and this warning would both be gone. So nothing is refreshed, and
   * the organizer is told to reload.
   */
  it('says the outcome is unknown, and does NOT reload, when the request got no answer', () => {
    unknownOutcomeOf(new TypeError('Failed to fetch'))

    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'warning',
          title: 'This change may or may not have been saved',
          message:
            'The save could not be confirmed. Reload the page and check the list before trying again.',
        },
      ],
    ])
    expect(h.refresh).not.toHaveBeenCalled()
    // The row is back on the answer it knew, and can be used.
    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-disabled')),
    ).toEqual(['false', 'false'])
  })

  /**
   * A REFUSAL WITH ITS OWN REASON reaches the organizer as itself: not as a
   * stale page, and not as an unknown outcome.
   */
  it("shows the server's own message when a stored name cannot be changed here", () => {
    const message =
      'The stored name of “Speaker ticket” contains an invisible character (such as a tab or a line break), so its answer cannot be changed here. Correct the name in Studio, then try again.'
    unknownOutcomeOf(
      Object.assign(new Error(message), {
        data: { code: 'UNPROCESSABLE_CONTENT' },
      }),
    )

    expect(h.notify.mock.calls).toEqual([
      [{ type: 'error', title: 'Could not save', message }],
    ])
    expect(h.refresh).not.toHaveBeenCalled()
  })
})

/**
 * The question opens under the row and closes again. Keyboard focus must not
 * fall back to the top of the page when it does.
 */
describe('focus around a question', () => {
  const last = props({
    typeName: TWO_DAY,
    configured: true,
    stored: true,
    lastGranting: true,
    builtInGranted: [SPEAKER],
  })
  const opener = () =>
    screen.getByRole('button', { name: /^No workshop access/ })

  it('returns to the button that asked when the organizer cancels', () => {
    render(<WorkshopAccessControl {...last} />)

    opener().focus()
    fireEvent.click(opener())
    screen.getByRole('button', { name: 'Cancel' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(opener()).toHaveFocus()
  })

  it('returns to the button that asked when the organizer confirms', () => {
    render(<WorkshopAccessControl {...last} />)

    fireEvent.click(opener())
    const confirm = screen.getByRole('button', {
      name: 'Save and use the built-in list',
    })
    confirm.focus()
    fireEvent.click(confirm)

    expect(h.mutate).toHaveBeenCalledTimes(1)
    expect(opener()).toHaveFocus()
  })
})

/**
 * A CARRY-OVER NEVER OVERWRITES A STORED NO (#1332 review). While nothing is
 * set to grant access the built-in list overrules a stored No, so a type can
 * be let in today and hold a No. The server lists such types apart; the
 * carry-over names and writes only the others, and the question says what
 * becomes of the ones with a No.
 */
describe('another type that holds a stored No', () => {
  const first = props({
    typeName: 'Early Bird',
    configured: false,
    others: [TWO_DAY],
    setToNo: [SPEAKER],
  })

  it('is not kept by the carry-over, and the question says it is blocked', () => {
    render(<WorkshopAccessControl {...first} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      `This is the first ticket type set to grant access.Saving it switches the built-in list off. Holders of “${TWO_DAY}” sign up through that list today, and are blocked unless that type is set to grant access in the same save. “${SPEAKER}” is already set to No, so its holders are blocked when the built-in list goes off.`,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: `Grant “Early Bird”, keep “${TWO_DAY}”`,
      }),
    )

    // "Speaker ticket" is not written: its stored No stands.
    expect(h.mutate.mock.calls).toEqual([
      [
        {
          updates: [
            { typeName: 'Early Bird', grantsWorkshop: true },
            { typeName: TWO_DAY, grantsWorkshop: true },
          ],
        },
      ],
    ])
  })

  /**
   * THE FIRST GRANT IS ALWAYS ASKED ABOUT when the built-in list lets another
   * type in, even when there is nothing to keep: every other such type holds a
   * No, and that No starts blocking its holders with this save.
   */
  it('is asked about on a first grant even with nothing to keep', () => {
    render(
      <WorkshopAccessControl
        {...props({
          typeName: 'Early Bird',
          configured: false,
          setToNo: [SPEAKER, TWO_DAY],
        })}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(h.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `This is the first ticket type set to grant access.Saving it switches the built-in list off. “${SPEAKER}” and “${TWO_DAY}” are already set to No, so their holders are blocked when the built-in list goes off.`,
    )
    // No button keeps a type that holds a No: that would overwrite it.
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Grants workshop access',
      'No workshop access',
      // Leaving things as they are comes first, and is the prominent one.
      'Cancel',
      'Grant “Early Bird”',
    ])
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain(
      'bg-blue-600',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Grant “Early Bird”' }))
    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: 'Early Bird', grantsWorkshop: true }] }],
    ])
  })

  it('is named in the question for a No as well', () => {
    render(
      <WorkshopAccessControl
        {...props({
          typeName: TWO_DAY,
          configured: false,
          builtInGrantsThis: true,
          others: [UPGRADE],
          setToNo: [SPEAKER, 'Early Bird'],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      `Set “${UPGRADE}” to grant access in the same save and the No takes effect. “${SPEAKER}” and “Early Bird” are already set to No, so their holders are blocked when the built-in list goes off.`,
    )
  })
})

/**
 * A QUESTION IS ONLY AS TRUE AS THE FACTS IT WAS ASKED ON. Another row's save
 * refreshes the page under an open question. The answer the question holds
 * (grant, or No) then means something else: a No asked as "this leaves no
 * type set to grant access" would re-render as "this No won't block the type
 * yet" once another type grants, and saving it WOULD block the type. So an
 * open question closes when what it was asked on changes, and nothing is
 * saved without a fresh click.
 */
describe('a question open while the page changes under it', () => {
  const lastGrant = {
    typeName: TWO_DAY,
    configured: true,
    stored: true,
    lastGranting: true,
    builtInGranted: [SPEAKER],
  }
  const no = () =>
    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))

  it('closes the last-grant question when another type starts granting', () => {
    const { rerender } = render(<WorkshopAccessControl {...props(lastGrant)} />)
    no()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This leaves no ticket type set to grant access.',
    )
    const confirm = screen.getByRole('button', {
      name: 'Save and use the built-in list',
    })
    confirm.focus()

    // Another row granted a type and the page refreshed.
    rerender(
      <WorkshopAccessControl
        {...props({ ...lastGrant, lastGranting: false })}
      />,
    )

    // No question at all: not this one, and not a different one in its place.
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Grants workshop access', 'No workshop access'])
    expect(h.mutate).not.toHaveBeenCalled()
    // Focus was in the question; it goes back to the button that asked.
    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveFocus()

    // A fresh click is decided on the new facts: another type grants, so the
    // No is saved straight away, with no confirmation nobody gave.
    no()
    expect(h.mutate.mock.calls).toEqual([
      [{ updates: [{ typeName: TWO_DAY, grantsWorkshop: false }] }],
    ])
  })

  it('closes a question asked while nothing granted when another type starts granting', () => {
    const onBuiltInList = {
      typeName: SPEAKER,
      configured: false,
      builtInGrantsThis: true,
      others: [TWO_DAY],
    }
    const { rerender } = render(
      <WorkshopAccessControl {...props(onBuiltInList)} />,
    )
    no()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `This No won’t block “${SPEAKER}” yet.`,
    )

    // Another row set a type to grant access, carrying this one over.
    rerender(
      <WorkshopAccessControl
        {...props({ typeName: SPEAKER, configured: true, stored: true })}
      />,
    )

    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('closes the first-grant question when another row makes the first grant', () => {
    const { rerender } = render(
      <WorkshopAccessControl
        {...props({
          typeName: 'Early Bird',
          configured: false,
          others: [TWO_DAY],
        })}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This is the first ticket type set to grant access.',
    )

    rerender(
      <WorkshopAccessControl
        {...props({ typeName: 'Early Bird', configured: true })}
      />,
    )

    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('stays open through a refresh that changes nothing it was asked on', () => {
    const { rerender } = render(<WorkshopAccessControl {...props(lastGrant)} />)
    no()
    const confirm = () =>
      screen.getByRole('button', { name: 'Save and use the built-in list' })
    confirm().focus()

    // The same facts in new objects, as every refresh delivers them.
    rerender(<WorkshopAccessControl {...props(lastGrant)} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This leaves no ticket type set to grant access.',
    )
    // And the organizer's place in it is kept: focus is not pulled away.
    expect(confirm()).toHaveFocus()
  })
})

/**
 * WHAT A SCREEN READER AND A KEYBOARD GET. The saving state and the answer
 * that follows it are announced politely; Escape closes an open question and
 * leaves focus on the button that asked.
 */
describe('without a mouse or a screen', () => {
  const last = props({
    typeName: TWO_DAY,
    configured: true,
    stored: true,
    lastGranting: true,
    builtInGranted: [SPEAKER],
  })

  it('announces the answer of a row, and that it is saving, politely', () => {
    h.isPending = true
    render(<WorkshopAccessControl {...last} row />)

    // `status` is a polite live region: what it holds is read out when it
    // changes, without interrupting.
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
  })

  it('closes an open question on Escape, with focus back on the button that asked', () => {
    render(<WorkshopAccessControl {...last} row />)
    const opener = screen.getByRole('button', { name: /^No workshop access/ })
    fireEvent.click(opener)
    const keep = screen.getByRole('button', { name: 'Cancel' })
    keep.focus()

    fireEvent.keyDown(keep, { key: 'Escape' })

    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(opener).toHaveFocus()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('makes leaving things as they are the prominent choice of the last-grant question', () => {
    render(<WorkshopAccessControl {...last} row />)
    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))

    const choices = within(screen.getByRole('alert')).getAllByRole('button')
    expect(choices.map((b) => b.textContent)).toEqual([
      'Cancel',
      'Save and use the built-in list',
    ])
    expect(choices[0].className).toContain('bg-blue-600')
    expect(choices[1].className).not.toContain('bg-blue-600')
  })
})

/**
 * A STORED NO THAT BLOCKS NOBODY YET. After "Save the No, block nothing yet"
 * the row has "No workshop access" pressed beside the answer "Grants workshop
 * access (built-in list)". Both are true; the row says why.
 */
describe('a No saved while the built-in list still decides', () => {
  const NOTE =
    'Saved as No. It takes effect once a ticket type is set to grant access.'

  it('says why the row shows both a No and a grant', () => {
    render(
      <WorkshopAccessControl
        {...props({
          typeName: SPEAKER,
          configured: false,
          stored: false,
          builtInGrantsThis: true,
        })}
        row
      />,
    )

    expect(screen.getByRole('group', { name: SPEAKER })).toHaveTextContent(NOTE)
    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['the No is in effect', { configured: true, stored: false }],
    [
      'the built-in list does not let the type in anyway',
      { configured: false, stored: false },
    ],
    ['no No is stored', { configured: false, builtInGrantsThis: true }],
  ])('says nothing of the kind when %s', (_when, state) => {
    render(
      <WorkshopAccessControl {...props({ typeName: SPEAKER, ...state })} row />,
    )

    expect(screen.getByRole('group', { name: SPEAKER })).not.toHaveTextContent(
      'Saved as No',
    )
    // The row is there, with its two buttons.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
