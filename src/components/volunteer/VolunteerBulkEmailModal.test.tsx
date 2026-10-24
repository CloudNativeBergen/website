/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VolunteerBulkEmailModal } from './VolunteerBulkEmailModal'
import type { VolunteerWithConference } from '@/lib/volunteer/types'

vi.mock('@/components/admin/EmailModal', () => ({
  EmailModal: (p: {
    title: string
    submitButtonText: string
    recipientInfo: React.ReactNode
  }) => (
    <div>
      <h2>{p.title}</h2>
      {p.recipientInfo}
      <button>{p.submitButtonText}</button>
    </div>
  ),
}))

const v = (id: string, email: string) =>
  ({ _id: id, name: id, email }) as VolunteerWithConference

describe('VolunteerBulkEmailModal', () => {
  it('counts deduped recipients and lets the organizer untick one', () => {
    render(
      <VolunteerBulkEmailModal
        isOpen
        onClose={() => {}}
        onSend={async () => {}}
        volunteers={[v('a', 'a@x.no'), v('b', 'A@X.no'), v('c', 'c@x.no')]}
      />,
    )
    expect(screen.getByText('Send to 2 volunteers')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('Send to 1 volunteer')).toBeTruthy()
  })
})
