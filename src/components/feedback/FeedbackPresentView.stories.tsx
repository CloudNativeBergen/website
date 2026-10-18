import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen } from 'storybook/test'
import { FeedbackPresentView } from './FeedbackPresentView'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackPresentView',
  component: FeedbackPresentView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Feedback Code on a projector: the QR as large as the screen allows, the short URL and “How was this session?”, black on white in both themes (it never takes the page’s dark mode). Portaled to `<body>`, so the theme decorator does not wrap it; `Dark` exists to show that nothing changes.',
      },
    },
  },
  args: { url: 'https://2026.cloudnativedays.no/f/k7m2qx', onClose: fn() },
  /**
   * The Fullscreen API refuses here, as it does on iPhone Safari: the view
   * must stand on its own as a window-filling overlay. (Headless Chromium
   * would otherwise grant it without a gesture and the runner could not
   * resize the window for the next story.) The panel's `PresentAndClose`
   * story runs the real request and exits on close.
   */
  beforeEach: () => {
    const real = Element.prototype.requestFullscreen
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new TypeError('Fullscreen API unavailable'))
    return () => {
      Element.prototype.requestFullscreen = real
    }
  },
} satisfies Meta<typeof FeedbackPresentView>

export default meta
type Story = StoryObj<typeof meta>

export const Projector: Story = {
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeVisible()
    // Black on white whatever the theme: a projector shows what it is given.
    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)')
    expect(getComputedStyle(dialog).color).toBe('rgb(0, 0, 0)')
    expect(document.fullscreenElement).toBeNull()
    // Fills the window on its own, full screen or not.
    const box = dialog.getBoundingClientRect()
    expect(box.width).toBe(window.innerWidth)
    expect(box.height).toBe(window.innerHeight)
  },
}

export const Dark: Story = { ...Projector, globals: { theme: 'dark' } }

export const Phone: Story = {
  ...Projector,
  parameters: { viewport: { defaultViewport: 'phone' } },
}

/** A URL no QR can hold: the screen says so instead of staying blank. */
export const QrCannotBeDrawn: Story = {
  args: { url: `https://2026.cloudnativedays.no/f/k7m2qx?${'x'.repeat(3000)}` },
  play: async () => {
    expect(
      await screen.findByText(
        'The QR code could not be drawn. Share the link instead.',
      ),
    ).toBeVisible()
  },
}
