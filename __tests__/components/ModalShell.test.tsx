/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react'
import { ModalShell } from '@/components/ModalShell'

afterEach(cleanup)

describe('ModalShell — standard header', () => {
  it('renders no injected header when `title` is omitted', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()}>
        <p>body content</p>
      </ModalShell>,
    )
    expect(screen.getByText('body content')).toBeInTheDocument()
    // No standard header ⇒ no injected close button.
    expect(
      screen.queryByRole('button', { name: 'Close dialog' }),
    ).not.toBeInTheDocument()
  })

  it('renders the house header (title, subtitle, icon, close button) and wires aria-labelledby', () => {
    render(
      <ModalShell
        isOpen
        onClose={vi.fn()}
        title="Compose message"
        subtitle="Proposal thread"
        icon={<svg data-testid="header-icon" />}
      >
        <p>body</p>
      </ModalShell>,
    )

    // Title is a HeadlessUI DialogTitle ⇒ the dialog is labelled by it.
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = screen.getByText('Compose message')
    expect(title.id).toBe(labelledBy)

    expect(screen.getByText('Proposal thread')).toBeInTheDocument()
    expect(screen.getByTestId('header-icon')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Close dialog' }),
    ).toBeInTheDocument()
  })

  it('header close button calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ModalShell isOpen onClose={onClose} title="Title">
        <p>body</p>
      </ModalShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ModalShell — presentation', () => {
  it('sheet (default) applies the bottom-sheet panel classes', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} size="md">
        <p>sheet body</p>
      </ModalShell>,
    )
    const panel = screen.getByText('sheet body').closest('[class*="max-h-"]')!
    // Full-width on mobile, max-width only at sm+, rounded top, capped height.
    expect(panel.className).toContain('rounded-t-2xl')
    expect(panel.className).toContain('sm:rounded-2xl')
    expect(panel.className).toContain('sm:max-w-md')
    expect(panel.className).toContain('max-h-[85dvh]')
  })

  it('centered forces the centered card at all sizes', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} size="md" presentation="centered">
        <p>centered body</p>
      </ModalShell>,
    )
    const panel = screen
      .getByText('centered body')
      .closest('[class*="rounded-2xl"]')!
    expect(panel.className).toContain('rounded-2xl')
    expect(panel.className).not.toContain('rounded-t-2xl')
    // Centered applies its max-width at every size (no sm: prefix), never
    // becomes a sheet.
    expect(panel.className).toContain('max-w-md')
    expect(panel.className).not.toContain('max-h-[85dvh]')
  })
})

describe('ModalShell — dirty-close guard', () => {
  const renderGuarded = (onClose: () => void) =>
    render(
      <ModalShell
        isOpen
        onClose={onClose}
        title="Edit"
        confirmOnDirtyClose
        isDirty
      >
        <p>guarded body</p>
      </ModalShell>,
    )

  it('Escape reveals the confirm instead of closing when dirty', () => {
    const onClose = vi.fn()
    renderGuarded(onClose)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument()
  })

  it('"Keep editing" dismisses the confirm without closing', () => {
    const onClose = vi.fn()
    renderGuarded(onClose)

    fireEvent.keyDown(document, { key: 'Escape' })
    const confirm = screen.getByRole('alertdialog')
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Keep editing' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('"Discard" closes the modal', () => {
    const onClose = vi.fn()
    renderGuarded(onClose)

    fireEvent.keyDown(document, { key: 'Escape' })
    const confirm = screen.getByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes immediately on Escape when not dirty', () => {
    const onClose = vi.fn()
    render(
      <ModalShell
        isOpen
        onClose={onClose}
        title="Edit"
        confirmOnDirtyClose
        isDirty={false}
      >
        <p>body</p>
      </ModalShell>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('the confirm buttons meet the 44px minimum touch target', () => {
    renderGuarded(vi.fn())
    fireEvent.keyDown(document, { key: 'Escape' })
    const confirm = screen.getByRole('alertdialog')
    for (const name of ['Keep editing', 'Discard']) {
      expect(within(confirm).getByRole('button', { name }).className).toContain(
        'min-h-[44px]',
      )
    }
  })
})
