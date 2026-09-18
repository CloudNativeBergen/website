/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlanFiltersBar } from './PlanFiltersBar'
import { NO_FILTERS } from './plan-filters'
import type { PlanView } from '@/lib/marketing/types'

afterEach(cleanup)

const view = {
  viewerId: null,
  campaigns: [],
  organizers: [],
  tasks: [],
} as unknown as PlanView

function open(label: string, filters = NO_FILTERS) {
  render(
    <PlanFiltersBar
      view={view}
      filters={filters}
      update={vi.fn()}
      count={0}
      clear={vi.fn()}
    />,
  )
  fireEvent.click(
    screen.getAllByRole('button', { name: new RegExp(`^${label}`) })[0],
  )
}

const radioFor = (label: string) =>
  screen
    .getAllByText(label)[0]
    .closest('button')
    ?.querySelector<HTMLInputElement>('input[type="radio"]')

describe('single-choice filter groups report their own state', () => {
  it('checks the default sort while it is in force', () => {
    // These groups used to pass an EMPTY selection when the default was active,
    // to keep the active-filter badge at zero — which left the option actually
    // in force showing nothing checked, because `AdminFilterBar` derives a
    // radio's state solely from `selected.includes(value)`.
    open('Sort')
    expect(radioFor('Overdue first, then due date')?.checked).toBe(true)
    expect(radioFor('Due date')?.checked).toBe(false)
  })

  it('checks the default due and progress options too', () => {
    open('Due')
    expect(radioFor('Any date')?.checked).toBe(true)
    cleanup()
    open('Progress')
    expect(radioFor('Any progress')?.checked).toBe(true)
  })

  it('moves the check when a non-default is chosen', () => {
    open('Due', { ...NO_FILTERS, due: 'next14' })
    expect(radioFor('Any date')?.checked).toBe(false)
    expect(radioFor('Next 14 days')?.checked).toBe(true)
  })
})
