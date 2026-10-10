import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SharedWorkshopLoginNotice } from './SharedWorkshopLoginNotice'

/** The amber "Workshop Registration" card of /privacy, which the note sits in. */
const meta = {
  title: 'Components/SharedWorkshopLoginNotice',
  component: SharedWorkshopLoginNotice,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The /privacy note for workshop participants: the WorkOS login is one account across every conference on the platform (#1299). Shown only to a tenant that discloses WorkOS.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
        <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
          Workshop Registration
        </h3>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SharedWorkshopLoginNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
