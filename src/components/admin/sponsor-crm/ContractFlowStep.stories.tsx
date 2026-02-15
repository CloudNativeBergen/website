import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContractFlowStep } from './ContractFlowStep'

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/ContractFlowStep',
  component: ContractFlowStep,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A vertical stepper component used inside the contract view to visualize the sponsor registration flow. Each step shows a numbered indicator with pending/active/complete states, a title, and content. Steps are connected by vertical lines that change color based on completion status.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContractFlowStep>

export default meta
type Story = StoryObj<typeof meta>

export const Pending: Story = {
  args: {
    step: 1,
    title: 'Sponsor registration',
    status: 'pending',
    children: (
      <p className="text-xs text-gray-400">
        Waiting for sponsor to begin registration.
      </p>
    ),
  },
}

export const Active: Story = {
  args: {
    step: 2,
    title: 'Generate & send contract',
    status: 'active',
    children: (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          All requirements met. Ready to generate contract.
        </p>
        <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">
          Generate contract PDF
        </button>
      </div>
    ),
  },
}

export const Complete: Story = {
  args: {
    step: 1,
    title: 'Sponsor registration',
    status: 'complete',
    children: (
      <p className="text-xs text-gray-500">
        Company details, contacts, billing, and logo collected. Completed
        2/15/2026.
      </p>
    ),
  },
}

export const LastStep: Story = {
  args: {
    step: 3,
    title: 'Digital signing',
    status: 'pending',
    isLast: true,
    children: (
      <p className="text-xs text-gray-400">
        Contract will be sent for digital signing after generation.
      </p>
    ),
  },
}

export const FullFlow: Story = {
  args: {
    step: 1,
    title: 'Sponsor registration',
    status: 'complete',
    children: null,
  },
  render: () => (
    <div className="space-y-0">
      <ContractFlowStep step={1} title="Sponsor registration" status="complete">
        <p className="text-xs text-gray-500">
          Company details, contacts, billing, and logo collected.
        </p>
      </ContractFlowStep>
      <ContractFlowStep
        step={2}
        title="Generate &amp; send contract"
        status="active"
      >
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            All requirements met. Ready to generate contract.
          </p>
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">
            Generate contract PDF
          </button>
        </div>
      </ContractFlowStep>
      <ContractFlowStep
        step={3}
        title="Digital signing"
        status="pending"
        isLast
      >
        <p className="text-xs text-gray-400">
          Contract will be sent for digital signing after generation.
        </p>
      </ContractFlowStep>
    </div>
  ),
}

export const AllComplete: Story = {
  args: {
    step: 1,
    title: 'Sponsor registration',
    status: 'complete',
    children: null,
  },
  render: () => (
    <div className="space-y-0">
      <ContractFlowStep step={1} title="Sponsor registration" status="complete">
        <p className="text-xs text-gray-500">Completed 2/1/2026.</p>
      </ContractFlowStep>
      <ContractFlowStep
        step={2}
        title="Generate &amp; send contract"
        status="complete"
      >
        <p className="text-xs text-gray-500">Contract sent on 2/5/2026.</p>
      </ContractFlowStep>
      <ContractFlowStep
        step={3}
        title="Digital signing"
        status="complete"
        isLast
      >
        <p className="text-xs text-gray-500">Signed on 2/10/2026.</p>
      </ContractFlowStep>
    </div>
  ),
}
