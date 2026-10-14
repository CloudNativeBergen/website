/**
 * @vitest-environment jsdom
 *
 * The over-capacity marker on a workshop card at `/admin/workshops` (#1361).
 *
 * Going past capacity is a named organizer action (#1344, #1356), and a card
 * that reads only `32/30` hides where it happened. The marker is computed from
 * the two numbers the card already shows, so it needs no read of its own, and
 * it is absent at exactly capacity: a full workshop is not an over-full one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopCard } from './WorkshopCard'

const workshop = (capacity: number) =>
  ({
    _id: 'ws-1',
    title: 'Kubernetes 101',
    format: 'workshop_120',
    capacity,
    speakers: [],
  }) as unknown as ProposalWithWorkshopData

const renderCard = (capacity: number, confirmedCount: number) =>
  render(
    <WorkshopCard
      workshop={workshop(capacity)}
      confirmedCount={confirmedCount}
      waitlistCount={0}
      onViewConfirmed={vi.fn()}
      onViewWaitlist={vi.fn()}
      onAddParticipant={vi.fn()}
      onEditCapacity={vi.fn()}
      onAnnounce={vi.fn()}
    />,
  )

afterEach(cleanup)

describe('WorkshopCard over-capacity marker', () => {
  it('says by how many seats a workshop is over capacity', () => {
    renderCard(30, 32)
    expect(screen.getByText('Over capacity by 2')).toBeInTheDocument()
    // The percentage is the real ratio, not the bar's capped 100.
    expect(screen.getByText('(107%)')).toBeInTheDocument()
  })

  it('shows no marker at exactly capacity', () => {
    renderCard(30, 30)
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument()
    // The card still shows the counts it always did.
    expect(screen.getByText('30/30')).toBeInTheDocument()
  })

  it('shows no marker below capacity', () => {
    renderCard(30, 12)
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument()
  })
})
