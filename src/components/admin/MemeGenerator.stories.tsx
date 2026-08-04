import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemeGenerator } from './MemeGenerator'

const meta = {
  title: 'Systems/Marketing/Admin/MemeGenerator',
  component: MemeGenerator,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    conferenceLogos: { title: 'Cloud Native Days Norway 2026' },
  },
} satisfies Meta<typeof MemeGenerator>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

/**
 * Canvas text is not DOM text, so a browser never fetches a webfont on its own
 * account of it — the component has to ask for the face and redraw once it
 * lands. This story types a headline and switches it to a family no other part
 * of the app renders, which is exactly the case that would otherwise paint in
 * the fallback sans.
 */
export const WebfontHeadline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // [0] is the Background & Logo panel; [1] belongs to Text Line 1.
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Advanced Options' })[1],
    )

    const text = 'Ship it'
    await userEvent.type(
      canvas.getAllByPlaceholderText('Enter your text...')[0],
      text,
    )
    await userEvent.selectOptions(
      canvas.getByLabelText('Font Family'),
      'IBM Plex Sans',
    )

    // The face reaching `loaded` is the assertion that matters. Nothing else on
    // this story renders IBM Plex Sans in the DOM, so it stays `unloaded` — and
    // the canvas silently paints in the fallback — unless the component asked
    // for it. `document.fonts.check()` would NOT catch that: it answers true
    // for any family with no `@font-face` at all.
    await waitFor(() => {
      const loaded = [...document.fonts].some(
        (face) => face.family === 'IBM Plex Sans' && face.status === 'loaded',
      )
      expect(loaded).toBe(true)
    })
  },
}
