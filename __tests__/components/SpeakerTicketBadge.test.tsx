/**
 * @vitest-environment jsdom
 *
 * The row action on `/admin/speakers` is offered for exactly two ticket states.
 *
 * "Claimed" needs nothing. "Unknown" means the provider could not be read — we
 * do not know whether an invitation is needed, and inviting on a guess emails a
 * speaker who may already hold their ticket. Both the desktop table and the
 * mobile card render this component, so gating it here is what keeps the two
 * from drifting apart.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SpeakerTicketBadge } from '@/components/admin/SpeakerTicketBadge'
import type { SpeakerTicketState } from '@/lib/tickets/speakerStatus'

afterEach(cleanup)

const INVITED_AT = '2026-02-01T09:00:00Z'

function renderBadge(
  state: SpeakerTicketState,
  props: Partial<Parameters<typeof SpeakerTicketBadge>[0]> = {},
) {
  const onSendInvitation = vi.fn()
  render(
    <SpeakerTicketBadge
      status={{
        speakerId: 'speaker-1',
        state,
        invitedAt: state === 'not-invited' ? undefined : INVITED_AT,
      }}
      onSendInvitation={onSendInvitation}
      {...props}
    />,
  )
  return { onSendInvitation }
}

describe('SpeakerTicketBadge row action', () => {
  it('offers "Send invitation" on a not-invited row', () => {
    const { onSendInvitation } = renderBadge('not-invited')

    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect(onSendInvitation).toHaveBeenCalledWith('speaker-1')
  })

  it('offers "Send again" on an invited row that has not claimed', () => {
    const { onSendInvitation } = renderBadge('invited')

    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))

    expect(onSendInvitation).toHaveBeenCalledWith('speaker-1')
  })

  it.each(['redeemed', 'unknown'] as const)(
    'offers no action on a %s row',
    (state) => {
      renderBadge(state)

      expect(screen.queryByRole('button')).toBeNull()
    },
  )

  it('offers nothing at all when the caller cannot send', () => {
    render(
      <SpeakerTicketBadge
        status={{ speakerId: 'speaker-1', state: 'not-invited' }}
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('disables the action while an invitation for that speaker is in flight', () => {
    renderBadge('not-invited', { sending: true })

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Sending')
  })
})
