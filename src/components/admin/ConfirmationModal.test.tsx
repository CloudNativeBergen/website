/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ConfirmationModal } from './ConfirmationModal'

const renderModal = (isLoading: boolean) => {
  const onClose = vi.fn()
  render(
    <ConfirmationModal
      isOpen
      onClose={onClose}
      onConfirm={() => {}}
      title="Send?"
      message="m"
      isLoading={isLoading}
    />,
  )
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  return onClose
}

describe('ConfirmationModal', () => {
  it('closes on Escape when idle', () => {
    expect(renderModal(false)).toHaveBeenCalled()
  })

  it('stays open on Escape while loading', () => {
    expect(renderModal(true)).not.toHaveBeenCalled()
  })
})
