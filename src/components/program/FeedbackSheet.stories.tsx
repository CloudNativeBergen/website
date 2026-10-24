import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { FeedbackSheet } from './FeedbackSheet'

/** Storybook's own embedded attendee page stands in for `/f/<code>?embed=1`. */
const frame = (story: string, theme = 'light') =>
  `/iframe.html?id=systems-proposals-session-feedback-attendeefeedbackpage--${story}&viewMode=story&globals=theme:${theme}`

const meta = {
  title: 'Systems/Program/FeedbackSheet',
  component: FeedbackSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
    docs: {
      description: {
        component:
          'The programme’s feedback sheet (speaker feedback spec §7.5): a bottom sheet framing the embedded attendee page, sized to its content. Here the frame shows the `Embedded` stories of `AttendeeFeedbackPage`; in the app it loads `/program/<talkId>/feedback?embed=1`.',
      },
    },
  },
  args: {
    open: true,
    onClose: fn(),
    src: frame('embedded'),
    title: 'Kubernetes for everyone',
  },
} satisfies Meta<typeof FeedbackSheet>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = body.getByRole('dialog', { name: 'Session feedback' })
    const iframe = dialog.querySelector('iframe')!
    await expect(iframe).toHaveAttribute(
      'title',
      'Feedback on Kubernetes for everyone',
    )
    // Shown once the page has loaded and been measured.
    await waitFor(() => expect(iframe).not.toHaveClass('opacity-0'), {
      timeout: 10_000,
    })
    await expect(body.queryByText('Loading…')).toBeNull()
  },
}

export const Answered: Story = {
  args: { src: frame('embedded-answered') },
}

/**
 * The sheet portals to `<body>`, outside the global decorator's `.dark`
 * wrapper, so dark goes on `<html>`, where the app puts it.
 */
function HtmlDark({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])
  return children
}

export const Dark: Story = {
  args: { src: frame('embedded', 'dark') },
  globals: { theme: 'dark' },
  decorators: [
    (Story) => (
      <HtmlDark>
        <Story />
      </HtmlDark>
    ),
  ],
}
