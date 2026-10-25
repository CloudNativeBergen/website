/**
 * PROTOTYPE (wayfinder #1571) — never merged.
 *
 * QUESTION: when Jev has judged a Feedback Response's comment, how does
 * that show up in the organizer's Session Feedback view next to the
 * speaker's flag — does it ACT LIKE a flag, SIT BESIDE it, or BOTH?
 *
 *   A · Flag with its source   A Judgement is a flag: one red pill, naming
 *                               the source; same Keep / Hide / Remove.
 *   B · Beside, with a filter  Speaker flags unchanged; a quiet amber chip
 *                               and a "Likely unsafe (n)" filter.
 *   C · Triage strip           Counts at the top that filter the list; a
 *                               flagged comment's text collapsed until opened.
 *
 * Fixtures, in every variant: a harsh-but-fair comment that must not look
 * flagged; one flagged by the speaker AND likely unsafe; one likely unsafe
 * for each reason (phone number, abusive, sexual, spam); one not judged;
 * one an organizer already kept; one already hidden.
 */

import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { VariantA, VariantB, VariantC } from './TalkFeedbackComments.prototype'

/** The confirmation is portaled past the theme wrapper: `dark` on the document too. */
function DocumentTheme({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return children
}

const meta = {
  title: 'Prototypes/Content Judgement/Session Feedback',
  parameters: { layout: 'fullscreen' },
  // The admin talk page's sidebar is 24rem wide (`lg:w-96`) with p-4; on a
  // phone it is the full width. Dark mode follows the global `theme`
  // toolbar (story-level `globals`).
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="w-full max-w-96 p-4">
            <Story />
          </div>
        </div>
      </DocumentTheme>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AFlagWithSource: Story = {
  name: 'A · Flag with its source',
  render: () => <VariantA />,
}
export const AFlagWithSourceDark: Story = {
  ...AFlagWithSource,
  name: 'A · Flag with its source (dark)',
  globals: { theme: 'dark' },
}

export const BBesideWithFilter: Story = {
  name: 'B · Beside, with a filter',
  render: () => <VariantB />,
}
export const BBesideWithFilterDark: Story = {
  ...BBesideWithFilter,
  name: 'B · Beside, with a filter (dark)',
  globals: { theme: 'dark' },
}

export const CTriageStrip: Story = {
  name: 'C · Triage strip, text collapsed',
  render: () => <VariantC />,
}
export const CTriageStripDark: Story = {
  ...CTriageStrip,
  name: 'C · Triage strip, text collapsed (dark)',
  globals: { theme: 'dark' },
}
