import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { FeedbackCodePanel } from './FeedbackCodePanel'

const URL = 'https://2026.cloudnativedays.no/f/k7m2qx'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackCodePanel',
  component: FeedbackCodePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The Feedback Code tab of the speaker’s Session Feedback section: the QR code for the attendee URL, the code’s state from the Feedback Window, PNG for slides, SVG, Print sheet, Present and Copy link. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: {
    url: URL,
    title: 'Kubernetes: the hard parts',
    window: { state: 'unscheduled', feedbackVisible: false },
  },
} satisfies Meta<typeof FeedbackCodePanel>

export default meta
type Story = StoryObj<typeof meta>

const before = {
  state: 'before',
  opensAt: '2026-10-29T08:00:00.000Z',
  lastSlotEnd: '2026-10-29T08:40:00.000Z',
  closesAt: '2026-10-30T08:40:00.000Z',
  feedbackVisible: false,
} as const

export const Unscheduled: Story = {}

export const BeforeSession: Story = { args: { window: before } }

export const Open: Story = {
  args: { window: { ...before, state: 'open', feedbackVisible: true } },
}

export const Closed: Story = {
  args: { window: { ...before, state: 'closed', feedbackVisible: true } },
}

/** Never scheduled, and the conference is over: it can no longer open. */
export const UnscheduledAfterConference: Story = {
  args: { window: { state: 'unscheduled', feedbackVisible: true } },
}

export const OpenDark: Story = {
  ...Open,
  globals: { theme: 'dark' },
}

/**
 * Replace the clipboard for one story. The test runner reuses one page for
 * every story, so the returned cleanup restores the real one.
 */
const stubClipboard = (writeText: () => Promise<void>) => {
  const real = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return () => {
    if (real) Object.defineProperty(navigator, 'clipboard', real)
    else delete (navigator as { clipboard?: unknown }).clipboard
  }
}

export const CopySucceeded: Story = {
  args: { window: before },
  beforeEach: () => stubClipboard(() => Promise.resolve()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Copy link/ }))
    expect(await canvas.findByText('Copied')).toBeVisible()
  },
}

/** The browser refuses the clipboard: say so, and point at the visible link. */
export const CopyFailed: Story = {
  args: { window: before },
  beforeEach: () => stubClipboard(() => Promise.reject(new Error('denied'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Copy link/ }))
    expect(
      await canvas.findByText('Couldn’t copy; select the link above'),
    ).toBeVisible()
  },
}

/** A URL too long for any QR code: the box says so instead of pulsing. */
export const QrCannotBeDrawn: Story = {
  args: {
    url: `${URL}?${'x'.repeat(3000)}`,
    window: before,
  },
  play: async ({ canvasElement }) => {
    expect(
      await within(canvasElement).findByText(
        'The QR code could not be drawn. Share the link instead.',
      ),
    ).toBeVisible()
  },
}

/**
 * Catch what the browser is handed to save. The test runner reuses one page
 * for every story, so the returned cleanup restores the real click.
 */
const saved: { name: string; href: string }[] = []
const stubDownloads = () => {
  saved.length = 0
  const real = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, href: this.href })
  }
  return () => {
    HTMLAnchorElement.prototype.click = real
  }
}

/** PNG for slides: a PNG named after the code and the talk. */
export const DownloadPng: Story = {
  args: { window: before },
  beforeEach: stubDownloads,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'PNG for slides' }),
    )
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe(
      'feedback-code-k7m2qx-kubernetes-the-hard-parts.png',
    )
    expect(saved[0].href.startsWith('data:image/png;base64,')).toBe(true)
  },
}

/** SVG: a vector file, still the symbol for this URL. */
export const DownloadSvg: Story = {
  args: { window: before },
  beforeEach: stubDownloads,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'SVG' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe(
      'feedback-code-k7m2qx-kubernetes-the-hard-parts.svg',
    )
    const svg = await (await fetch(saved[0].href)).text()
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('stroke="#000000"')
  },
}

/** Replace the print dialog for one story. */
const printed = { n: 0 }
const stubPrint = () => {
  printed.n = 0
  const real = window.print
  window.print = () => void printed.n++
  return () => {
    window.print = real
  }
}

/**
 * Print sheet: the sheet is mounted into `<body>` (hidden on screen, shown
 * alone by the print stylesheet), the dialog opens once its QR has loaded,
 * and the sheet leaves with `afterprint`.
 */
export const PrintSheet: Story = {
  args: { window: before },
  beforeEach: stubPrint,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Print sheet' }))
    await waitFor(() => expect(printed.n).toBe(1))
    const sheet = document.querySelector('[data-feedback-print]')
    expect(sheet).not.toBeNull()
    expect(sheet).toHaveTextContent('How was this session?')
    expect(sheet).toHaveTextContent('Kubernetes: the hard parts')
    expect(sheet).toHaveTextContent('2026.cloudnativedays.no/f/k7m2qx')
    expect(sheet).not.toBeVisible()
    window.dispatchEvent(new Event('afterprint'))
    await waitFor(() =>
      expect(document.querySelector('[data-feedback-print]')).toBeNull(),
    )
    expect(printed.n).toBe(1)
  },
}

/** Present: full screen, and Esc or Close brings the page back. */
export const PresentAndClose: Story = {
  args: { window: before },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const open = () =>
      userEvent.click(canvas.getByRole('button', { name: 'Present' }))
    await open()
    const dialog = await screen.findByRole('dialog', {
      name: 'Feedback Code on screen',
    })
    expect(dialog).toHaveTextContent('How was this session?')
    expect(dialog).toHaveTextContent('2026.cloudnativedays.no/f/k7m2qx')
    expect(within(dialog).getByRole('button', { name: /Close/ })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await open()
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /Close/,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** A URL no QR can hold: every action says so, and the link stays. */
export const DownloadFailed: Story = {
  args: { url: `${URL}?${'x'.repeat(3000)}`, window: before },
  beforeEach: stubDownloads,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'PNG for slides' }),
    )
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The QR code could not be drawn. Share the link instead.',
    )
    expect(saved).toHaveLength(0)
  },
}
