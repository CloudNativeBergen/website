import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorRenewalAction } from './SponsorRenewalWidget'

const nextEdition = {
  title: 'Cloud Native Day 2027',
  origin: 'https://2027.example.test',
}

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorRenewalAction',
  component: SponsorRenewalAction,
  parameters: { layout: 'padded' },
  args: { nextEdition, existingId: null, onCopy: fn() },
} satisfies Meta<typeof SponsorRenewalAction>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {}

export const Copying: Story = { args: { isPending: true } }

export const AlreadyCopied: Story = { args: { existingId: 'sfc-2027' } }

export const NoNextEdition: Story = { args: { nextEdition: null } }

export const Failed: Story = {
  args: { error: 'Sponsor not found' },
}
