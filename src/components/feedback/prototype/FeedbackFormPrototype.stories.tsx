import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedbackFormPrototype } from './FeedbackFormPrototype'

/**
 * PROTOTYPE (#1420) — throwaway. Three variants of the attendee Feedback
 * Response form plus the shared states. Dark mode via the LOCAL decorator
 * from `parameters.dark`.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <Story />
  </div>
)

const talk = {
  title: 'KRO-nicles: Composing Kubernetes Resources Without the Glue Code',
  speakers: ['Ingrid Hansen', 'Lars Berg'],
  public: true,
}

const meta = {
  title: 'Prototypes/SpeakerFeedback/AttendeeForm',
  component: FeedbackFormPrototype,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: {
    variant: 'A',
    conferenceName: 'Cloud Native Days Norway 2026',
    talk,
    state: { kind: 'open', closesAt: 'Thursday 11:40' },
  },
} satisfies Meta<typeof FeedbackFormPrototype>

export default meta
type Story = StoryObj<typeof meta>

export const AOneTap: Story = {}
export const AOneTapAnswered: Story = {
  args: { initialAnswer: { colour: 'green', comment: '' } },
}
export const BFormThenSend: Story = { args: { variant: 'B' } }
export const CCards: Story = { args: { variant: 'C' } }
export const CCardsAnswered: Story = {
  args: { variant: 'C', initialAnswer: { colour: 'yellow', comment: '' } },
}
export const AOneTapDark: Story = { parameters: { dark: true } }
export const CCardsDark: Story = {
  args: { variant: 'C' },
  parameters: { dark: true },
}

export const NotYetOpenPublic: Story = {
  args: { state: { kind: 'notYetOpen', opensAt: 'Wednesday 10:20' } },
}
export const NotYetOpenUnannounced: Story = {
  args: { talk: { ...talk, public: false }, state: { kind: 'notYetOpen' } },
}
export const Closed: Story = { args: { state: { kind: 'closed' } } }
export const UnknownCode: Story = { args: { state: { kind: 'unknown' } } }
