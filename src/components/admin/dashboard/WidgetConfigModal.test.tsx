/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { WidgetConfigModal } from './WidgetConfigModal'

afterEach(cleanup)

// 'review-progress' has a real config schema in the widget registry:
// targetReviewsPerDay (number, default 5) and showAverageScore (boolean).
const baseProps = {
  isOpen: true,
  widgetType: 'review-progress',
  widgetDisplayName: 'Review Progress',
  currentConfig: { targetReviewsPerDay: 12, showAverageScore: true },
}

describe('WidgetConfigModal', () => {
  it('clicking Cancel closes the modal WITHOUT saving', () => {
    // Regression: Cancel used to be an implicit type="submit" button inside
    // the config <form>, so clicking it ran handleSubmit and saved the
    // edits the user was discarding.
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <WidgetConfigModal {...baseProps} onSave={onSave} onClose={onClose} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking Reset to Defaults resets fields without saving or closing', () => {
    // Regression: Reset used to be an implicit type="submit" button, so it
    // submitted the PRE-reset values and closed the modal.
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <WidgetConfigModal {...baseProps} onSave={onSave} onClose={onClose} />,
    )

    const input = screen.getByLabelText<HTMLInputElement>(
      'Target Reviews Per Day',
    )
    expect(input.value).toBe('12')

    fireEvent.click(screen.getByRole('button', { name: /Reset to Defaults/ }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Modal stays open showing the schema defaults
    expect(screen.getByText('Configure Widget')).toBeInTheDocument()
    expect(input.value).toBe('5')
  })

  it('clicking Save Changes validates and saves, then closes', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <WidgetConfigModal {...baseProps} onSave={onSave} onClose={onClose} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({
      targetReviewsPerDay: 12,
      showAverageScore: true,
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
