/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const m = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      setDinnerChoice: {
        useMutation: () => ({ mutateAsync: m.mutateAsync }),
      },
    },
  },
}))

import { DinnerRouteChoice } from '@/components/cfp/DinnerRouteChoice'

const routes = [
  { _key: 'taxi', label: 'Taxi from the venue' },
  { _key: 'hike', label: 'Hike' },
]

/** A save the test resolves by hand. */
function deferred() {
  let resolve!: (v: unknown) => void
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const radio = (name: string) => screen.getByRole('radio', { name })
const status = () => screen.getByRole('status').textContent

beforeEach(() => {
  m.mutateAsync.mockReset()
})

describe('DinnerRouteChoice', () => {
  it('is a labelled radio group with the routes, own and not coming', () => {
    render(<DinnerRouteChoice routes={routes} choice={null} />)
    const group = screen.getByRole('group', {
      name: 'How are you getting there?',
    })
    expect(group.tagName).toBe('FIELDSET')
    expect(
      screen.getAllByRole('radio').map((r) => r.getAttribute('value')),
    ).toEqual(['taxi', 'hike', 'own', 'not-coming'])
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    expect(status()).toBe('Not answered yet.')
  })

  it('shows the saved choice', () => {
    render(<DinnerRouteChoice routes={routes} choice="hike" />)
    expect(radio('Hike')).toHaveProperty('checked', true)
    expect(status()).toBe('Saved.')
  })

  it('saves on change', async () => {
    m.mutateAsync.mockResolvedValue({ choice: 'taxi' })
    render(<DinnerRouteChoice routes={routes} choice={null} />)
    await act(async () => {
      fireEvent.click(radio('Taxi from the venue'))
    })
    expect(m.mutateAsync).toHaveBeenCalledWith({ choice: 'taxi' })
    expect(status()).toBe('Saved.')
  })

  it('arrowing through the radios keeps focus and saves only the final value', async () => {
    const first = deferred()
    m.mutateAsync
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ choice: 'not-coming' })
    render(<DinnerRouteChoice routes={routes} choice={null} />)
    // What a browser does on ArrowDown: focus and check the next radio.
    for (const name of [
      'Taxi from the venue',
      'Hike',
      "I'll get there on my own",
      "I'm not coming to the dinner",
    ]) {
      radio(name).focus()
      fireEvent.click(radio(name))
    }
    const last = radio("I'm not coming to the dinner")
    expect(document.activeElement).toBe(last)
    expect(last).toHaveProperty('disabled', false)
    expect(screen.getByRole('group').getAttribute('aria-busy')).toBe('true')
    expect(status()).toBe('Saving…')
    await act(async () => first.resolve({ choice: 'taxi' }))
    // The first save was already in flight; the rest collapse to the last.
    expect(m.mutateAsync.mock.calls).toEqual([
      [{ choice: 'taxi' }],
      [{ choice: 'not-coming' }],
    ])
    expect(document.activeElement).toBe(last)
    expect(last).toHaveProperty('checked', true)
    expect(status()).toBe('Saved.')
  })

  it('a second change while saving is sent after the first settles', async () => {
    const first = deferred()
    m.mutateAsync
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ choice: 'hike' })
    render(<DinnerRouteChoice routes={routes} choice={null} />)
    fireEvent.click(radio('Taxi from the venue'))
    fireEvent.click(radio('Hike'))
    expect(m.mutateAsync).toHaveBeenCalledTimes(1)
    await act(async () => first.resolve({ choice: 'taxi' }))
    expect(m.mutateAsync).toHaveBeenLastCalledWith({ choice: 'hike' })
    expect(radio('Hike')).toHaveProperty('checked', true)
  })

  it('rolls back to the saved choice and shows an error when the save fails', async () => {
    m.mutateAsync.mockRejectedValue(new Error('down'))
    render(<DinnerRouteChoice routes={routes} choice="hike" />)
    await act(async () => {
      fireEvent.click(radio('Taxi from the venue'))
    })
    expect(radio('Hike')).toHaveProperty('checked', true)
    expect(screen.getByRole('alert').textContent).toMatch(/not saved/)
  })
})

describe('SpeakerBriefingPanel with the route picker', () => {
  it('asks about anything else once the picker covers the route', async () => {
    const { SpeakerBriefingPanel } =
      await import('@/components/cfp/SpeakerBriefingPanel')
    const briefing = { todos: [], dinner: { venueName: 'Bryggen', routes } }
    const { rerender } = render(
      <SpeakerBriefingPanel
        briefing={briefing}
        changesEmail="cfp@example.com"
        dinnerChoice={null}
      />,
    )
    expect(screen.getByRole('group')).toBeTruthy()
    expect(screen.getByText(/Anything else about the dinner\?/)).toBeTruthy()
    rerender(
      <SpeakerBriefingPanel
        briefing={briefing}
        changesEmail="cfp@example.com"
      />,
    )
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.getByText(/Changed your plans\?/)).toBeTruthy()
  })
})
