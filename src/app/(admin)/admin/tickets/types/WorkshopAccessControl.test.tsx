/**
 * @vitest-environment jsdom
 *
 * DECLARING WORKSHOP ACCESS, on the card that shows the ticket type.
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
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { WorkshopAccessControl } from './WorkshopAccessControl'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  isPending: false,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setWorkshopAccess: {
          useMutation: () => ({ mutate: h.mutate, isPending: h.isPending }),
        },
      },
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

const SPEAKER = 'Speaker ticket'
const TWO_DAY = 'Workshop + Conference (2 days)'
const UPGRADE = 'Sponsor discount (workshop upgrade)'

beforeEach(() => {
  vi.clearAllMocks()
  h.isPending = false
})
afterEach(cleanup)

describe('a conference still on the historical list', () => {
  const onBridge = {
    typeName: SPEAKER,
    workshopConfigured: false,
    bridgeGrantsThisType: true,
    bridgeGrantedOtherTypes: [TWO_DAY, UPGRADE],
  }

  it('names the types that would lose access, before any click', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    expect(screen.getByText('Historical list')).toBeInTheDocument()
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
      screen.getByText(/first workshop declaration at this conference/),
    ).toBeInTheDocument()
    expect(screen.getByText(/will stop unless declared/)).toHaveTextContent(
      TWO_DAY,
    )
  })

  it('carries the currently-granting types over in ONE mutation', () => {
    render(<WorkshopAccessControl {...onBridge} />)

    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Declare this type/ }))

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
      screen.queryByText(/first workshop declaration/),
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
        typeName={SPEAKER}
        workshopConfigured={false}
        bridgeGrantsThisType={false}
        bridgeGrantedOtherTypes={[]}
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
        typeName={UPGRADE}
        workshopConfigured
        declaredGrantsWorkshop={false}
      />,
    )

    expect(screen.queryByText(/historical list/i)).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /^Grants workshop access/ }),
    )

    expect(h.mutate).toHaveBeenCalledWith({
      updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
    })
  })

  /** A type nobody declared is neither in nor out — an organizer must answer. */
  it('says an undeclared type sends its holders to an organizer', () => {
    render(<WorkshopAccessControl typeName="Mystery pass" workshopConfigured />)

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
        typeName={TWO_DAY}
        workshopConfigured={false}
        bridgeGrantsThisType
        bridgeGrantedOtherTypes={[SPEAKER]}
      />,
    )
    expect(screen.getByText('Historical list')).toBeInTheDocument()

    // Another card saved, carrying this one; the refreshed page says so.
    rerender(
      <WorkshopAccessControl
        typeName={TWO_DAY}
        workshopConfigured
        declaredGrantsWorkshop
      />,
    )

    expect(screen.getByText('Declared')).toBeInTheDocument()
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
      <WorkshopAccessControl typeName={TWO_DAY} workshopConfigured />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^No workshop access/ }))
    expect(h.mutate).toHaveBeenCalled()

    h.isPending = true
    rerender(
      <WorkshopAccessControl
        typeName={TWO_DAY}
        workshopConfigured
        declaredGrantsWorkshop
      />,
    )

    expect(
      screen.getByRole('button', { name: /^No workshop access/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('is reversible without Studio', () => {
    render(
      <WorkshopAccessControl
        typeName={SPEAKER}
        workshopConfigured
        declaredGrantsWorkshop
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
