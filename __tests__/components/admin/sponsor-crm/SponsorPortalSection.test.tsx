/**
 * @vitest-environment jsdom
 *
 * The portal section follows its PROPS (#1263 review): a send through the
 * Send modal refreshes the sponsor, and the link, the sent confirmation and
 * Resend must appear without a remount.
 */
import React from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    registration: {
      generateToken: {
        useMutation: () => ({
          mutate: h.mutate,
          data: undefined,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}))

import { SponsorPortalSection } from '@/components/admin/sponsor-crm/SponsorPortalSection'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('SponsorPortalSection', () => {
  it('reveals the link, the sent state and Resend when the sponsor refreshes after a send', () => {
    const onSendInvite = vi.fn()
    const { rerender } = render(
      <SponsorPortalSection
        sponsorForConferenceId="sfc-1"
        onSendInvite={onSendInvite}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Send registration email' }),
    )
    expect(onSendInvite).toHaveBeenCalledTimes(1)
    expect(screen.queryByDisplayValue(/sponsor\/portal/)).toBeNull()

    rerender(
      <SponsorPortalSection
        sponsorForConferenceId="sfc-1"
        existingToken="tok-1"
        registrationSent
        onSendInvite={onSendInvite}
      />,
    )
    expect(screen.getByDisplayValue(/\/sponsor\/portal\/tok-1$/)).toBeVisible()
    expect(
      screen.getByText('Registration email sent to sponsor contacts'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(onSendInvite).toHaveBeenCalledTimes(2)
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('"Copy link only" reveals an existing token without minting', () => {
    render(
      <SponsorPortalSection
        sponsorForConferenceId="sfc-1"
        existingToken="tok-1"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy link only' }))
    expect(screen.getByDisplayValue(/\/sponsor\/portal\/tok-1$/)).toBeVisible()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('"Copy link only" mints when there is no token', () => {
    render(<SponsorPortalSection sponsorForConferenceId="sfc-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link only' }))
    expect(h.mutate).toHaveBeenCalledWith({ sponsorForConferenceId: 'sfc-1' })
  })
})
