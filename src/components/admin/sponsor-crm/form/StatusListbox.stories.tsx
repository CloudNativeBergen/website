/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatusListbox } from './StatusListbox'
import { STATUSES, INVOICE_STATUSES, CONTRACT_STATUSES } from './constants'
import { useState } from 'react'

const meta: Meta<typeof StatusListbox> = {
  title: 'Systems/Sponsors/Admin/Form/StatusListbox',
  component: StatusListbox,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown selector for sponsor, contract, and invoice statuses. Features icon-based visual indicators with brand colors: Cloud Blue for primary actions, Fresh Green for success states, and Sunbeam Yellow for warnings. Supports helper text and disabled states for workflow validation.',
      },
    },
  },
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Disable the listbox',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the listbox',
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof StatusListbox>

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState<string>('prospect')
    return (
      <StatusListbox
        label="Sponsor Status"
        value={value}
        onChange={setValue}
        options={STATUSES}
      />
    )
  },
}

export const AllStates: Story = {
  render: () => {
    const [sponsorValue, setSponsorValue] = useState<string>('negotiating')
    const [contractValue, setContractValue] = useState<string>('draft')
    const [invoiceValue, setInvoiceValue] = useState<string>('paid')
    const [helpValue, setHelpValue] = useState<string>('negotiating')
    const [disabledValue, setDisabledValue] = useState<string>('closed-won')

    return (
      <div className="space-y-8">
        {/* Status Types */}
        <div>
          <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
            Status Types
          </h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">
                Sponsor Status
              </h4>
              <StatusListbox
                label="Sponsor Status"
                value={sponsorValue}
                onChange={setSponsorValue}
                options={STATUSES}
              />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">
                Contract Status
              </h4>
              <StatusListbox
                label="Contract Status"
                value={contractValue}
                onChange={setContractValue}
                options={CONTRACT_STATUSES}
              />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">
                Invoice Status
              </h4>
              <StatusListbox
                label="Invoice Status"
                value={invoiceValue}
                onChange={setInvoiceValue}
                options={INVOICE_STATUSES}
              />
            </div>
          </div>
        </div>

        {/* All Sponsor Statuses */}
        <div>
          <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
            All Sponsor Statuses
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {STATUSES.map((status) => (
              <div key={status.value} className="space-y-2">
                <h4 className="text-sm font-medium text-gray-600">
                  {status.label}
                </h4>
                <StatusListbox
                  label="Sponsor Status"
                  value={status.value}
                  onChange={() => {}}
                  options={STATUSES}
                />
              </div>
            ))}
          </div>
        </div>

        {/* All Contract Statuses */}
        <div>
          <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
            All Contract Statuses
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {CONTRACT_STATUSES.map((status) => (
              <div key={status.value} className="space-y-2">
                <h4 className="text-sm font-medium text-gray-600">
                  {status.label}
                </h4>
                <StatusListbox
                  label="Contract Status"
                  value={status.value}
                  onChange={() => {}}
                  options={CONTRACT_STATUSES}
                />
              </div>
            ))}
          </div>
        </div>

        {/* All Invoice Statuses */}
        <div>
          <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
            All Invoice Statuses
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {INVOICE_STATUSES.map((status) => (
              <div key={status.value} className="space-y-2">
                <h4 className="text-sm font-medium text-gray-600">
                  {status.label}
                </h4>
                <StatusListbox
                  label="Invoice Status"
                  value={status.value}
                  onChange={() => {}}
                  options={INVOICE_STATUSES}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Special States */}
        <div>
          <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
            Special States
          </h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">
                With Helper Text
              </h4>
              <StatusListbox
                label="Sponsor Status"
                value={helpValue}
                onChange={setHelpValue}
                options={STATUSES}
                helperText="(current pipeline stage)"
              />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">Disabled</h4>
              <StatusListbox
                label="Sponsor Status"
                value={disabledValue}
                onChange={setDisabledValue}
                options={STATUSES}
                disabled={true}
                helperText="(locked)"
              />
            </div>
          </div>
        </div>
      </div>
    )
  },
}
