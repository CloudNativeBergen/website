import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContentCard } from './ContentCard'

const meta = {
  title: 'Components/Layout/ContentCard',
  component: ContentCard,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A card wrapper used for legal/content pages (terms, conduct, privacy). Provides consistent border, shadow, dark mode, and print styles.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ContentCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div className="prose prose-lg dark:prose-invert max-w-none">
        <h2 className="text-2xl font-semibold text-blue-600">
          Section Heading
        </h2>
        <p>
          This is an example of content rendered inside a ContentCard. It
          provides consistent styling for legal and informational pages across
          the site.
        </p>
        <ul>
          <li>Consistent border and shadow styling</li>
          <li>Dark mode support</li>
          <li>Print-optimized layout</li>
        </ul>
      </div>
    ),
  },
}

export const TermsExample: Story = {
  args: { children: null },
  render: () => (
    <div className="bg-gray-50 px-4 py-8 dark:bg-gray-900">
      <ContentCard>
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h2 className="text-2xl font-semibold text-blue-600">
            Terms of Service
          </h2>
          <p>
            By attending Cloud Native Days Norway, you agree to the following
            terms and conditions. Please read them carefully before
            participating.
          </p>
          <h3>1. Acceptance of Terms</h3>
          <p>
            These terms govern your participation in events organized by Cloud
            Native Days Norway.
          </p>
          <h3>2. Event Participation</h3>
          <p>
            All participants must comply with our Code of Conduct and follow
            event guidelines.
          </p>
        </div>
      </ContentCard>
    </div>
  ),
}

export const WithCustomClassName: Story = {
  args: {
    className: 'mt-8',
    children: (
      <p className="text-gray-700 dark:text-gray-300">
        This card has a custom className to override the default margin-top.
      </p>
    ),
  },
}
