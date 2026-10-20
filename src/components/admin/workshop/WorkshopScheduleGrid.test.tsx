/**
 * @vitest-environment jsdom
 *
 * The grid sits under the "Workshops" h2 (#1452): a day or "Not in the
 * schedule" is an h3, and a card's title is one level below the heading it
 * sits under.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopScheduleGrid } from './WorkshopScheduleGrid'

const w = (_id: string, date?: string) =>
  ({
    _id,
    title: _id,
    ...(date && { date, room: 'Room A', startTime: '09:00', endTime: '11:00' }),
  }) as unknown as ProposalWithWorkshopData

const grid = (workshops: ProposalWithWorkshopData[]) =>
  render(
    <WorkshopScheduleGrid
      workshops={workshops}
      renderCard={(workshop, titleLevel) => (
        <span data-testid={workshop._id}>{titleLevel}</span>
      )}
    />,
  )

const levelOf = (id: string) => screen.getByTestId(id).textContent

afterEach(cleanup)

describe('the heading levels of the workshop grid', () => {
  it('two days and unscheduled: h3 groups, cards one below', () => {
    grid([w('a', '2026-10-27'), w('b', '2026-10-28'), w('c')])
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['2026-10-27', '2026-10-28', 'Not in the schedule'])
    expect([levelOf('a'), levelOf('b'), levelOf('c')]).toEqual(['4', '4', '4'])
  })

  it('one day, nothing unscheduled: no group heading, cards at h3', () => {
    grid([w('a', '2026-10-27')])
    expect(screen.queryAllByRole('heading')).toEqual([])
    expect(levelOf('a')).toBe('3')
  })

  it('nothing scheduled: no group heading, cards at h3', () => {
    grid([w('c')])
    expect(screen.queryAllByRole('heading')).toEqual([])
    expect(levelOf('c')).toBe('3')
  })
})
