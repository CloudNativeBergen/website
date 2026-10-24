/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { VolunteerBulkEmailModal } from './VolunteerBulkEmailModal'
import type { VolunteerWithConference } from '@/lib/volunteer/types'

// The stub exposes onSend through a button and shows any thrown error.
vi.mock('@/components/admin/EmailModal', async () => {
  const { useState } = await import('react')
  return {
    EmailModal: (p: {
      title: string
      submitButtonText: string
      recipientInfo: React.ReactNode
      onSend: (d: { subject: string; message: unknown }) => Promise<void>
    }) => {
      const [err, setErr] = useState('')
      return (
        <div>
          <h2>{p.title}</h2>
          {p.recipientInfo}
          <button
            onClick={() =>
              p.onSend({ subject: 's', message: [] }).then(
                () => setErr('ok'),
                (e: Error) => setErr(e.message),
              )
            }
          >
            {p.submitButtonText}
          </button>
          <p data-testid="err">{err}</p>
        </div>
      )
    },
  }
})

const conference = { _id: 'c', title: 'CND', contactEmail: 'hi@cnd.no' }
const v = (id: string, email = `${id}@x.no`) =>
  ({
    _id: id,
    name: id,
    email,
    conference,
  }) as unknown as VolunteerWithConference

describe('VolunteerBulkEmailModal', () => {
  it('counts deduped recipients and lets the organizer untick one', () => {
    render(
      <VolunteerBulkEmailModal
        isOpen
        onClose={() => {}}
        onSend={async () => ({ failed: [] })}
        volunteers={[v('a', 'a@x.no'), v('b', 'A@X.no'), v('c', 'c@x.no')]}
      />,
    )
    expect(screen.getByText('Send to 2 volunteers')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('Send to 1 volunteer')).toBeTruthy()
  })

  it('sends in chunks, lists failures and resumes without resending', async () => {
    const volunteers = Array.from({ length: 30 }, (_, i) => v(`v${i}`))
    const calls: string[][] = []
    let attempt = 0
    const onSend = vi.fn(
      async ({ volunteerIds }: { volunteerIds: string[] }) => {
        attempt++
        if (attempt === 2) throw new Error('timeout')
        calls.push(volunteerIds)
        return {
          failed: volunteerIds.includes('v1')
            ? [{ id: 'v1', email: 'v1@x.no', error: 'bounced' }]
            : [],
        }
      },
    )
    const onComplete = vi.fn()
    render(
      <VolunteerBulkEmailModal
        isOpen
        onClose={() => {}}
        onSend={onSend}
        onComplete={onComplete}
        volunteers={volunteers}
      />,
    )
    const send = screen.getByText('Send to 30 volunteers')
    await act(async () => fireEvent.click(send))
    expect(screen.getByTestId('err').textContent).toMatch(
      /Stopped after 25 of 30: timeout/,
    )
    expect(screen.getByText('Sent 25 of 30')).toBeTruthy()
    expect(screen.getByText('v1@x.no: bounced')).toBeTruthy()

    // Retry: the failed v1 and the unsent 5; never the 24 already sent.
    await act(async () => fireEvent.click(send))
    expect(calls.map((c) => c.length)).toEqual([25, 6])
    expect(calls[1]).toContain('v1')
    expect(screen.getByTestId('err').textContent).toMatch(
      /1 could not be sent: v1@x.no/,
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows progress before the first chunk returns', async () => {
    let release: () => void = () => {}
    const onSend = vi.fn(
      () =>
        new Promise<{ failed: never[] }>((r) => {
          release = () => r({ failed: [] })
        }),
    )
    render(
      <VolunteerBulkEmailModal
        isOpen
        onClose={() => {}}
        onSend={onSend}
        volunteers={[v('a'), v('b')]}
      />,
    )
    await act(async () =>
      fireEvent.click(screen.getByText('Send to 2 volunteers')),
    )
    expect(screen.getByText('Sent 0 of 2')).toBeTruthy()
    await act(async () => release())
    expect(screen.getByText('Sent 2 of 2')).toBeTruthy()
  })
})
