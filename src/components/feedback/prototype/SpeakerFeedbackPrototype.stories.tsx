import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerFeedbackPrototype } from './SpeakerFeedbackPrototype'

/**
 * PROTOTYPE (#1421) — throwaway. Three variants of the speaker's Feedback
 * Code + Session Feedback view. Dark mode via the LOCAL decorator from
 * `parameters.dark`.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <Story />
  </div>
)

const comments = [
  {
    id: '1',
    colour: 'green' as const,
    text: 'Best demo of the day. The live rollback when the RGD broke was exactly what I needed to see.',
    at: '11:42',
  },
  {
    id: '2',
    colour: 'yellow' as const,
    text: 'Good content, but the first 10 minutes on CRD basics could be skipped for this audience.',
    at: '11:47',
  },
  {
    id: '3',
    colour: 'green' as const,
    text: 'Slides please!',
    at: '11:51',
  },
  {
    id: '4',
    colour: 'red' as const,
    text: 'Hard to read the code from the back row — bigger font next time.',
    at: '12:05',
  },
]

const meta = {
  title: 'Prototypes/SpeakerFeedback/SpeakerView',
  component: SpeakerFeedbackPrototype,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: {
    variant: 'A',
    phase: 'live',
    url: 'https://2026.cloudnativedays.no/f/k7m2qx',
    slot: 'Wed 10:40–11:20',
    closesAt: 'Thu 11:20',
    digital: { green: 31, yellow: 8, red: 2 },
    cards: { green: 12, yellow: 3, red: 1 },
    comments,
  },
} satisfies Meta<typeof SpeakerFeedbackPrototype>

export default meta
type Story = StoryObj<typeof meta>

export const ASidebarLive: Story = {}
export const ASidebarBefore: Story = { args: { phase: 'before' } }
export const BSectionLive: Story = { args: { variant: 'B' } }
export const BSectionBefore: Story = { args: { variant: 'B', phase: 'before' } }
export const CPageLive: Story = { args: { variant: 'C' } }
export const CPageBefore: Story = { args: { variant: 'C', phase: 'before' } }
export const BSectionLiveDark: Story = {
  args: { variant: 'B' },
  parameters: { dark: true },
}
export const CPageUnscheduled: Story = {
  args: { variant: 'C', phase: 'unscheduled', cards: undefined },
}
