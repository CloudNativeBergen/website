/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReportInput } from '@/lib/marketing/report/types'
const query = vi.hoisted(() => vi.fn())
vi.mock('@/lib/trpc/client', () => ({
  api: {
    marketing: {
      report: {
        get: { useQuery: query },
        exportPdf: { useMutation: () => ({ isPending: false }) },
        exportCsv: { useMutation: () => ({ isPending: false }) },
      },
    },
  },
}))
vi.mock('@/components/admin/AdminPageHeader', () => ({
  AdminPageHeader: () => <h1>Marketing Report</h1>,
}))
import { MarketingReportPage } from './MarketingReportPage'
afterEach(() => {
  cleanup()
  query.mockReset()
})
describe('report range recovery', () => {
  it('applies corrected dates after a failed read without resetting', () => {
    query.mockReturnValue({
      data: undefined,
      error: new Error('Read failed'),
      isPending: false,
      isFetching: false,
    })
    render(<MarketingReportPage />)
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2027-02-01' },
    })
    fireEvent.change(screen.getByLabelText('Before (exclusive)'), {
      target: { value: '2027-03-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(query.mock.lastCall?.[0]).toEqual({
      grain: 'daily',
      from: '2027-02-01',
      to: '2027-03-01',
    })
  })
  it('rejects an inverted range locally and then accepts the corrected range', () => {
    query.mockImplementation((input: ReportInput) => ({
      data: undefined,
      error: input.from ? null : new Error('Initial read failed'),
      isPending: false,
      isFetching: false,
    }))
    render(<MarketingReportPage />)
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2027-03-01' },
    })
    fireEvent.change(screen.getByLabelText('Before (exclusive)'), {
      target: { value: '2027-02-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(query.mock.lastCall?.[0]).toEqual({ grain: 'daily' })
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose valid dates with From earlier than Before.',
    )
    fireEvent.change(screen.getByLabelText('Before (exclusive)'), {
      target: { value: '2027-04-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(query.mock.lastCall?.[0]).toEqual({
      grain: 'daily',
      from: '2027-03-01',
      to: '2027-04-01',
    })
  })
})
