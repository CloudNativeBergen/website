import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { FeedbackPrintSheet } from './FeedbackPrintSheet'

/** The symbol the sheet shows, drawn once per story from the real renderer. */
import { renderFeedbackQrPng } from '@/lib/feedback/code-assets'

const URL = 'https://2026.cloudnativedays.no/f/k7m2qx'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackPrintSheet',
  component: FeedbackPrintSheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The A4 sheet for the room: “How was this session?”, the talk title, a large QR and the short URL without scheme. Inline styles, black on white, so it prints the same from a light or a dark page. In the app it is mounted hidden and shown alone by the print stylesheet; here it is shown at A4 width (210 mm) so it can be looked at.',
      },
    },
  },
  args: { title: 'Kubernetes: the hard parts', url: URL, qrSrc: '' },
  loaders: [async () => ({ qrSrc: await renderFeedbackQrPng(URL, 1024) })],
  render: (args, { loaded }) => (
    <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
      <FeedbackPrintSheet {...args} qrSrc={loaded.qrSrc as string} />
    </div>
  ),
} satisfies Meta<typeof FeedbackPrintSheet>

export default meta
type Story = StoryObj<typeof meta>

export const A4: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      canvas.getByRole('heading', { level: 1, name: 'How was this session?' }),
    ).toBeVisible()
    expect(
      canvas.getByRole('heading', {
        level: 2,
        name: 'Kubernetes: the hard parts',
      }),
    ).toBeVisible()
    expect(canvas.getByText('2026.cloudnativedays.no/f/k7m2qx')).toBeVisible()
    expect(canvas.getByRole('img', { name: /QR code/ })).toBeVisible()
  },
}

/** Same sheet from a dark page: nothing on it follows the theme. */
export const Dark: Story = { ...A4, globals: { theme: 'dark' } }

export const LongTitle: Story = {
  args: {
    title:
      'Observability-driven development at scale: tracing, metrics and logs across forty clusters without losing your mind',
  },
}
