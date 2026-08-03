import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PreviewBandFrame } from './PreviewBandFrame'
import type { SectionContentStatus } from '@/lib/homepage/contentStatus'

/**
 * Every state one band of the preview can be in, side by side — the regression
 * net for the chrome that makes the preview honest. The band content itself is a
 * neutral stand-in: what is under test here is the frame, not a section.
 */

function status(
  overrides: Partial<SectionContentStatus> = {},
): SectionContentStatus {
  return {
    type: 'homepageFeaturedSpeakers',
    kind: 'empty-hides',
    willHide: true,
    count: 0,
    countLabel: 'speakers',
    summary: 'No speakers yet',
    reason: 'Hidden on the live site — no featured speakers are selected.',
    source: {
      id: 'featured-speakers',
      label: 'Featured speakers',
      href: '/admin/marketing/featured',
      manageLabel: 'Choose speakers',
    },
    manage: { label: 'Choose speakers', href: '/admin/marketing/featured' },
    ...overrides,
  }
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-gray-50 px-6 py-16 text-center dark:bg-gray-900">
      <p className="font-space-grotesk text-2xl font-medium text-gray-700 dark:text-gray-200">
        {children}
      </p>
    </section>
  )
}

const meta = {
  title: 'Systems/Homepage/Admin/PreviewBandFrame',
  component: PreviewBandFrame,
  parameters: { layout: 'fullscreen' },
  args: {
    sectionKey: 'speakers',
    label: 'Featured Speakers',
    mode: 'design' as const,
    children: <Band>Featured Speakers band</Band>,
  },
} satisfies Meta<typeof PreviewBandFrame>

export default meta
type Story = StoryObj<typeof meta>

/** Real content behind it: no chrome at all until the organizer points at it. */
export const Ready: Story = {}

/** Standing on sample content: dashed amber outline + a chip that links out. */
export const SampleBacked: Story = {
  args: { sample: true, status: status() },
}

/** Switched off with the eye toggle: ghosted, not absent. */
export const Hidden: Story = {
  args: { hidden: true },
}

/** Renders nothing even with samples: plated with the renderer's own reason. */
export const EmptyPlate: Story = {
  args: {
    label: 'Rich Text',
    emptyInPreview: true,
    status: status({
      type: 'homepageRichText',
      reason:
        'Hidden on the live site — this block has no body text, so there is nothing to render.',
      manage: null,
    }),
  },
}

/** Renders, but thinner than intended — the sponsors band with no sponsors. */
export const Degraded: Story = {
  args: {
    label: 'Sponsors',
    status: status({
      type: 'homepageSponsors',
      kind: 'degraded',
      willHide: false,
      summary: 'No sponsors — CTA only',
      manage: { label: 'Manage sponsors', href: '/admin/sponsors' },
    }),
    children: <Band>Sponsors band (CTA only)</Band>,
  },
}

/** Selected in the composer rail. */
export const Focused: Story = {
  args: { focused: true },
}

/** Hovered in the composer rail — the other half of the locate loop. */
export const Hovered: Story = {
  args: { hovered: true },
}

/** A section that threw. Its siblings and the editor are untouched. */
export const Failed: Story = {
  args: {
    children: <ThrowingSection />,
  },
}

function ThrowingSection(): never {
  throw new Error('This section threw during render')
}

export const SampleBackedDark: Story = {
  args: { sample: true, status: status() },
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export const EmptyPlateDark: Story = {
  ...EmptyPlate,
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export const FailedDark: Story = {
  ...Failed,
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
