import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { SendContractButton } from './SendContractButton'
import { mockSponsor, mockReadinessReady } from '@/__mocks__/sponsor-data'

const meta: Meta<typeof SendContractButton> = {
  title: 'Systems/Sponsors/Admin/Pipeline/SendContractButton',
  component: SendContractButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'CRM header button that opens the multi-step Send Contract flow. Hidden when contract is already signed; shows "Resend" when contract has been sent. Opens SendContractModal for readiness check, PDF preview, and send confirmation.',
      },
    },
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: { data: mockReadinessReady() },
            })
          },
        ),
        http.get('/api/trpc/sponsor.contractTemplates.findBest', () => {
          return HttpResponse.json({
            result: {
              data: {
                _id: 'template-1',
                title: 'Standard Contract (English)',
                language: 'en',
              },
            },
          })
        }),
        http.post(
          '/api/trpc/sponsor.contractTemplates.generatePdf',
          async () => {
            await delay(500)
            return HttpResponse.json({
              result: {
                data: {
                  pdf: 'JVBERi0=',
                  filename: 'contract-acme-corporation.pdf',
                },
              },
            })
          },
        ),
        http.post('/api/trpc/sponsor.crm.sendContract', async () => {
          await delay(500)
          return HttpResponse.json({
            result: { data: { success: true } },
          })
        }),
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SendContractButton>

/** Default state for a sponsor with verbal agreement. */
export const Default: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'verbal-agreement',
    }),
  },
}

/** Shows "Resend" label when contract was already sent. */
export const ContractAlreadySent: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      contractSentAt: '2026-02-01T10:00:00Z',
      signatureStatus: 'pending',
    }),
  },
}

/** Shows a green "Signed" indicator when contract is signed. */
export const ContractSigned: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-signed',
      contractSignedAt: '2026-02-10T14:00:00Z',
      signatureStatus: 'signed',
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Displays a non-interactive signed confirmation badge when the contract is already signed.',
      },
    },
  },
}
