import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { PhoneFlowPrototype, SAMPLE_PHOTOS } from './PhoneFlowPrototype'

/**
 * PROTOTYPE (#1477) — throwaway. Three variants of the phone flow for creating
 * a Wall Post. Flip variants with the floating bar or ← →. Dark mode via the
 * LOCAL decorator from `parameters.dark`.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <Story />
  </div>
)

const photo = SAMPLE_PHOTOS[0]
const filled = {
  photo,
  filter: 'fjord' as const,
  text: 'Kubectl apply -f joy',
  name: 'Ingrid',
}

const meta = {
  title: 'Prototypes/PhotoWall/PhoneFlow',
  component: PhoneFlowPrototype,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [withTheme],
  args: {
    variant: 'A',
    conferenceName: 'Cloud Native Days Norway 2026',
  },
} satisfies Meta<typeof PhoneFlowPrototype>

export default meta
type Story = StoryObj<typeof meta>

// A — Polaroid composer
export const AComposer: Story = {}
export const AComposeFilled: Story = {
  args: { initialStep: 'compose', initialDraft: filled },
}
export const APending: Story = {
  args: {
    initialStep: 'sent',
    initialSent: [{ status: 'pending', draft: filled }],
  },
}
export const ALive: Story = {
  args: {
    initialStep: 'sent',
    initialSent: [{ status: 'live', draft: filled }],
  },
}
export const AComposeDark: Story = {
  ...AComposeFilled,
  parameters: { dark: true },
}

// B — Stories editor
export const BStories: Story = { args: { variant: 'B' } }
export const BEditFilled: Story = {
  args: {
    variant: 'B',
    initialStep: 'edit',
    initialDraft: { ...filled, filter: 'vivid', text: 'Day 1 ☁️' },
  },
}
export const BSendSheet: Story = {
  args: {
    variant: 'B',
    initialStep: 'send',
    initialDraft: { ...filled, filter: 'vivid', text: 'Day 1 ☁️' },
  },
}
export const BMyPosts: Story = {
  args: {
    variant: 'B',
    initialStep: 'mine',
    initialSent: [
      { status: 'live', draft: { text: 'Best keynote!' } },
      { status: 'rejected' },
      { status: 'pending', draft: { text: 'Day 1 ☁️', filter: 'vivid' } },
    ],
  },
}
export const BMyPostsDark: Story = { ...BMyPosts, parameters: { dark: true } }

// C — Step-by-step
export const CWizard: Story = { args: { variant: 'C' } }
export const CCrop: Story = {
  args: { variant: 'C', initialStep: 'crop', initialDraft: { photo } },
}
export const CFilter: Story = {
  args: { variant: 'C', initialStep: 'filter', initialDraft: { photo } },
}
export const CReview: Story = {
  args: {
    variant: 'C',
    initialStep: 'review',
    initialDraft: { ...filled, text: 'Great talk on eBPF! #CNDN' },
  },
}
export const CDone: Story = { args: { variant: 'C', initialStep: 'done' } }
export const CWizardDark: Story = {
  args: { variant: 'C' },
  parameters: { dark: true },
}
