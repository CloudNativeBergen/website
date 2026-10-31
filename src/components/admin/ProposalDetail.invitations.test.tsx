/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CoSpeakerInvitationList } from './ProposalDetail'

const now = new Date('2025-11-01T12:00:00Z')

describe('CoSpeakerInvitationList', () => {
  it('shows each live invitation with its status', () => {
    render(
      <CoSpeakerInvitationList
        now={now}
        invitations={[
          {
            _id: 'p',
            invitedEmail: 'bob@example.com',
            invitedName: 'Bob',
            status: 'pending',
            expiresAt: '2025-11-04T12:00:00Z',
          },
          {
            _id: 'a',
            invitedEmail: 'carol@example.com',
            status: 'accepted',
            expiresAt: '2025-11-10T12:00:00Z',
          },
          {
            _id: 'd',
            invitedEmail: 'dave@example.com',
            status: 'declined',
            expiresAt: '2025-11-10T12:00:00Z',
          },
          {
            _id: 'e',
            invitedEmail: 'erin@example.com',
            status: 'expired',
            expiresAt: '2025-10-20T12:00:00Z',
          },
          {
            _id: 'c',
            invitedEmail: 'frank@example.com',
            status: 'canceled',
            expiresAt: '2025-11-10T12:00:00Z',
          },
        ]}
      />,
    )
    const list = screen.getByRole('region', { name: 'Co-speaker invitations' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Bob.*bob@example\.com.*Pending.*3 days left/),
      expect.stringMatching(/carol@example\.com.*Accepted/),
      expect.stringMatching(/dave@example\.com.*Declined/),
      expect.stringMatching(/erin@example\.com.*Expired/),
    ])
    expect(screen.queryByText(/frank@example\.com/)).toBeNull()
  })

  it('renders nothing without live invitations', () => {
    const { container } = render(
      <CoSpeakerInvitationList
        invitations={[
          {
            _id: 'c',
            invitedEmail: 'frank@example.com',
            status: 'canceled',
            expiresAt: '2025-11-10T12:00:00Z',
          },
        ]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
