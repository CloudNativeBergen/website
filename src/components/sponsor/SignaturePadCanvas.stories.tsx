import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SignaturePadCanvas } from './SignaturePadCanvas'

const meta = {
  title: 'Systems/Sponsors/Signing/SignaturePadCanvas',
  component: SignaturePadCanvas,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Canvas-based signature pad using the signature_pad library. Captures handwritten signatures as PNG data URLs for embedding into contract PDFs. Supports high-DPI displays, responsive resizing, and touch input.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSignatureChange: fn(),
  },
} satisfies Meta<typeof SignaturePadCanvas>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default signature pad ready for input. Draw with mouse or touch to sign.
 * The `onSignatureChange` callback fires with a `data:image/png;base64,...`
 * string after each stroke, or `null` when cleared.
 */
export const Default: Story = {}

/**
 * Disabled state — the pad is visible but does not accept input.
 * Used when a signature has already been submitted or the form is read-only.
 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

/**
 * Compact variant with reduced height for space-constrained layouts.
 */
export const Compact: Story = {
  args: {
    height: 120,
  },
}

/**
 * Tall variant for when a larger signing area is preferred.
 */
export const Tall: Story = {
  args: {
    height: 300,
  },
}
