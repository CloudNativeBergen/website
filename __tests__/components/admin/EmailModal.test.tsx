// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const h = vi.hoisted(() => ({
  showNotification: vi.fn(),
  isLocalhost: false,
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
}))
vi.mock('@/lib/environment/localhost', () => ({
  isLocalhostClient: () => h.isLocalhost,
}))
// The rich-text editor is a browser component; the modal only reads its value.
vi.mock('@/components/PortableTextEditor', () => ({
  PortableTextEditor: () => <div data-testid="editor" />,
}))
// ModalShell is mocked away below, so the title cannot sit inside a Dialog.
vi.mock('@headlessui/react', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  DialogTitle: ({ children, ...rest }: React.ComponentProps<'h2'>) => (
    <h2 {...rest}>{children}</h2>
  ),
}))
vi.mock('@/components/ModalShell', () => ({
  ModalShell: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode
    isOpen: boolean
  }) => (isOpen ? <div>{children}</div> : null),
}))

import { EmailModal } from '@/components/admin/EmailModal'

const renderModal = (
  props: Partial<React.ComponentProps<typeof EmailModal>> = {},
) => {
  const onSend = vi.fn().mockResolvedValue(undefined)
  render(
    <EmailModal
      isOpen
      onClose={vi.fn()}
      title="Send reminder"
      recipientInfo="kari@acme.test"
      fromAddress="sponsors@example.test"
      submitButtonText="Send reminder"
      initialValues={{ subject: 'Reminder', message: [] }}
      onSend={onSend}
      {...props}
    />,
  )
  return { onSend }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)

describe('EmailModal with an empty body', () => {
  it('refuses to send by default: the button is disabled and the handler warns', async () => {
    const { onSend } = renderModal()
    const button = await screen.findByRole('button', { name: /Send reminder/ })
    expect(button).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends when the caller says the body may be empty (its card is the content)', async () => {
    const { onSend } = renderModal({ allowEmptyBody: true })
    const button = await screen.findByRole('button', { name: /Send reminder/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend.mock.calls[0][0]).toMatchObject({ subject: 'Reminder' })
    expect(h.showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Missing information' }),
    )
  })

  it('still needs a subject even when the body may be empty', async () => {
    renderModal({
      allowEmptyBody: true,
      initialValues: { subject: '', message: [] },
    })
    const button = await screen.findByRole('button', { name: /Send reminder/ })
    expect(button).toBeDisabled()
  })
})
