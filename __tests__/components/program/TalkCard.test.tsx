/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { TalkCard } from '@/components/program/TalkCard'
import { BookmarksProvider } from '@/contexts/BookmarksContext'
import type { TrackTalk } from '@/lib/conference/types'

type CardTalk = TrackTalk & {
  scheduleDate: string
  trackTitle: string
  trackIndex: number
}

const baseSlot = {
  startTime: '09:00',
  endTime: '09:30',
  scheduleDate: '2026-03-10',
  trackTitle: 'Track A',
  trackIndex: 0,
}

function renderCard(talk: CardTalk) {
  return render(
    <BookmarksProvider>
      <TalkCard talk={talk} />
    </BookmarksProvider>,
  )
}

describe('TalkCard service session vs dangling reference', () => {
  it('renders a genuine service session (placeholder, no talk ref)', () => {
    const { container } = renderCard({
      ...baseSlot,
      placeholder: 'Lunch Break',
    })

    expect(container.textContent).toContain('Lunch Break')
  })

  it('falls back to "Service Session" for a placeholder-less slot with no talk ref', () => {
    const { container } = renderCard({ ...baseSlot })

    expect(container.textContent).toContain('Service Session')
  })

  it('renders nothing for a dangling talk reference (proposal deleted)', () => {
    // hasTalkRef true but the reference did not resolve (talk is undefined):
    // the proposal was deleted. This must NOT be mislabelled as a service
    // session — it should be dropped entirely.
    const { container } = renderCard({
      ...baseSlot,
      hasTalkRef: true,
    })

    expect(container.firstChild).toBeNull()
    expect(container.textContent).not.toContain('Service Session')
  })
})
