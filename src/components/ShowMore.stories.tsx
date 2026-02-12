import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ShowMore } from './ShowMore'

const meta = {
  title: 'Components/ShowMore',
  component: ShowMore,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ShowMore>

export default meta
type Story = StoryObj<typeof meta>

const shortText = `This is a short paragraph that fits within the line clamp limit.`

const longText = `Cloud Native Days Norway is a community-driven conference that brings together the best minds in cloud native technology. Our mission is to educate, inspire, and connect developers, operators, and business leaders who are building and running cloud native applications.

We believe that the future of software is cloud native, and we're committed to helping our community navigate this exciting landscape. From Kubernetes and containers to serverless and GitOps, we cover the full spectrum of cloud native technologies.

Our conference features world-class speakers, hands-on workshops, and networking opportunities that will help you level up your cloud native skills. Whether you're just getting started or you're a seasoned expert, there's something for everyone at Cloud Native Days Norway.

Join us and be part of the movement that's transforming how we build and deploy software. Together, we can build a more resilient, scalable, and efficient future.

This is additional text that demonstrates the expand/collapse functionality of the ShowMore component.`

export const ShortContent: Story = {
  args: {
    children: <p>{shortText}</p>,
  },
}

export const LongContent: Story = {
  args: {
    children: (
      <>
        {longText.split('\n\n').map((paragraph, index) => (
          <p key={index} className={index > 0 ? 'mt-4' : ''}>
            {paragraph}
          </p>
        ))}
      </>
    ),
  },
}

export const WithClassName: Story = {
  args: {
    children: (
      <>
        {longText.split('\n\n').map((paragraph, index) => (
          <p key={index} className={index > 0 ? 'mt-4' : ''}>
            {paragraph}
          </p>
        ))}
      </>
    ),
    className: 'bg-gray-100 p-4 rounded-lg dark:bg-gray-800',
  },
}

export const Documentation: Story = {
  args: {
    children: <p>Demo content</p>,
  },
  render: () => (
    <div className="max-w-2xl space-y-6 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        ShowMore Component
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        A content container that automatically truncates long content with a
        &quot;Show more&quot; / &quot;Show less&quot; toggle. Uses CSS
        line-clamp for smooth truncation.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="list-inside list-disc space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            <strong>Smart detection:</strong> Only shows toggle when content
            overflows
          </li>
          <li>
            <strong>Line clamp:</strong> Truncates content at 6 lines by default
          </li>
          <li>
            <strong>Accessible:</strong> Toggle button is properly focusable
          </li>
          <li>
            <strong>Brand styled:</strong> Uses brand cloud blue for the toggle
            link
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Example - Short Content
        </h3>
        <ShowMore className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          <p>{shortText}</p>
        </ShowMore>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Example - Long Content
        </h3>
        <ShowMore className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          {longText.split('\n\n').map((paragraph, index) => (
            <p key={index} className={index > 0 ? 'mt-4' : ''}>
              {paragraph}
            </p>
          ))}
        </ShowMore>
      </div>
    </div>
  ),
}

/**
 * Tests that clicking "Show more" expands the content and changes to "Show less"
 */
export const ExpandCollapseInteraction: Story = {
  args: {
    children: (
      <>
        {longText.split('\n\n').map((paragraph, index) => (
          <p key={index} className={index > 0 ? 'mt-4' : ''}>
            {paragraph}
          </p>
        ))}
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Wait for component to render and detect overflow
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Find and click "Show more" button
    const showMoreButton = canvas.getByRole('button', { name: /show more/i })
    await expect(showMoreButton).toBeVisible()
    await userEvent.click(showMoreButton)

    // After clicking, button should say "Show less"
    const showLessButton = canvas.getByRole('button', { name: /show less/i })
    await expect(showLessButton).toBeVisible()

    // Click again to collapse
    await userEvent.click(showLessButton)

    // Button should be back to "Show more"
    await expect(
      canvas.getByRole('button', { name: /show more/i })
    ).toBeVisible()
  },
}

/**
 * Tests keyboard accessibility - can toggle with Enter key
 */
export const KeyboardToggle: Story = {
  args: {
    children: (
      <>
        {longText.split('\n\n').map((paragraph, index) => (
          <p key={index} className={index > 0 ? 'mt-4' : ''}>
            {paragraph}
          </p>
        ))}
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Wait for component to render
    await new Promise((resolve) => setTimeout(resolve, 100))

    const showMoreButton = canvas.getByRole('button', { name: /show more/i })

    // Focus the button
    await userEvent.tab()
    await expect(showMoreButton).toHaveFocus()

    // Press Enter to expand
    await userEvent.keyboard('{Enter}')

    // Should now show "Show less"
    await expect(
      canvas.getByRole('button', { name: /show less/i })
    ).toBeVisible()
  },
}
