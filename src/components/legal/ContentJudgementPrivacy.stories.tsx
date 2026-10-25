import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ContentJudgementPrivacy } from './ContentJudgementPrivacy'

const meta = {
  title: 'Components/ContentJudgementPrivacy',
  component: ContentJudgementPrivacy,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'How /privacy describes content judgement (Content judgement spec §13.2): shown only while the organization has it on or still stores a Judgement, the same condition that lists OpenRouter as a subprocessor. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ContentJudgementPrivacy>

export default meta
type Story = StoryObj<typeof meta>

export const Section: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 3,
        name: 'Automatic checks on what you write',
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/through OpenRouter to TypeSafe.s Jev classifier/),
    ).toBeInTheDocument()
  },
}

export const SectionDark: Story = { ...Section, globals: { theme: 'dark' } }
