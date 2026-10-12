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
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
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
  lastGranting = false,
  builtInGranted = [],
}: {
  typeName: string
  configured: boolean
  stored?: boolean
  builtInGrantsThis?: boolean
  others?: string[]
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
      builtInGrantedOthers: others,
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
      screen.getByText(/first ticket type marked at this conference/),
    ).toBeInTheDocument()
    expect(screen.getByText(/will stop unless marked/)).toHaveTextContent(
      TWO_DAY,
    )
  })

  it('carries the currently-granting types over in ONE mutation', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Mark this type/ }))

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
    const only = screen.getByRole('button', { name: /^Only this type/ })
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
      screen.queryByText(/first ticket type marked/),
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

    fireEvent.click(screen.getByRole('button', { name: /^Deny this type/ }))
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
        'This leaves no ticket type that grants workshop access.',
      )
      expect(question).toHaveTextContent(
        `The built-in list will decide again. It grants workshop access to “${SPEAKER}” and “${TWO_DAY}”, and to no other ticket type.`,
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
      `A no on its own changes nothing.No ticket type is marked, so the built-in list keeps deciding, and on it “${SPEAKER}” still grants access. To revoke it, mark “${TWO_DAY}” in the same save: that switches the built-in list off.`,
    )
    // Nothing on screen claims a type loses access or that the list goes off
    // by itself.
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Grants workshop access',
      'No workshop access',
      `Deny this type and keep “${TWO_DAY}”`,
      'Save anyway: nothing changes yet',
      'Cancel',
    ])
  })

  it('tells the organizer the built-in list still decides after a lone no', () => {
    render(<WorkshopAccessControl {...onBuiltInList} />)

    no()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save anyway: nothing changes yet' }),
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
          message: `“${SPEAKER}” is saved as no workshop access. No ticket type is marked, so the built-in list decides who can sign up.`,
        },
      ],
    ])
  })

  it('says the type no longer grants when the no is saved with a mark', () => {
    render(<WorkshopAccessControl {...onBuiltInList} />)

    no()
    fireEvent.click(screen.getByRole('button', { name: /^Deny this type/ }))
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls[0][0].message).toBe(
      `“${SPEAKER}” no longer grants workshop access. 1 other ticket type keeps it.`,
    )
  })

  it('says the built-in list decides again after the last mark is taken away', () => {
    render(
      <WorkshopAccessControl
        {...props({
          typeName: TWO_DAY,
          configured: true,
          stored: true,
          lastGranting: true,
          builtInGranted: [TWO_DAY],
        })}
      />,
    )

    no()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save and use the built-in list' }),
    )
    act(() => h.options.onSuccess!())

    expect(h.notify.mock.calls[0][0].message).toBe(
      `“${TWO_DAY}” is saved as no workshop access. No ticket type is marked, so the built-in list decides who can sign up.`,
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

  it('puts the stored answer back when the save is refused', () => {
    render(<WorkshopAccessControl {...row} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    expect(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    act(() => h.options.onError!(new Error('Reload the page.')))

    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(h.notify.mock.calls).toEqual([
      [{ type: 'error', title: 'Could not save', message: 'Reload the page.' }],
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
