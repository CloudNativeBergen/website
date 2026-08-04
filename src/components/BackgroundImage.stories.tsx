import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BackgroundImage } from './BackgroundImage'
import type { BackgroundPattern } from '@/lib/conference/backgroundPattern'

/**
 * The per-conference background-pattern switch (go-live gate G2, E1). Each story
 * renders {@link BackgroundImage} filling a hero-sized frame with a heading on
 * top, so the three states are directly comparable at 393px in light and dark.
 */
const meta = {
  title: 'Components/BackgroundImage',
  component: BackgroundImage,
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta<typeof BackgroundImage>

export default meta
type Story = StoryObj<typeof meta>

function Frame({ pattern }: { pattern: BackgroundPattern }) {
  return (
    <div className="relative h-[600px] w-full overflow-hidden bg-white dark:bg-gray-950">
      <BackgroundImage className="inset-0" pattern={pattern} />
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
          {pattern}
        </h1>
        <p className="font-inter mt-4 max-w-md text-base text-brand-slate-gray dark:text-gray-300">
          Background pattern set to <code>{pattern}</code>.
        </p>
      </div>
    </div>
  )
}

/**
 * What an UNCONFIGURED tenant gets: no `backgroundPattern` stored, no pattern
 * prop, no provider. The platform default is `'none'` — the CNCF logo field is
 * opt-in, not the house style. `CloudNative` below is what the three live Cloud
 * Native Days editions render once migration 046 has stored the value they
 * currently inherit from the (former) default.
 */
export const PlatformDefault: Story = {
  render: () => (
    <div className="relative h-[600px] w-full overflow-hidden bg-white dark:bg-gray-950">
      <BackgroundImage className="inset-0" />
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
          unset
        </h1>
        <p className="font-inter mt-4 max-w-md text-base text-brand-slate-gray dark:text-gray-300">
          No pattern configured — resolves to <code>none</code>.
        </p>
      </div>
    </div>
  ),
}

export const CloudNative: Story = {
  render: () => <Frame pattern="cloud-native" />,
}

export const Subtle: Story = {
  render: () => <Frame pattern="subtle" />,
}

export const None: Story = {
  render: () => <Frame pattern="none" />,
}
