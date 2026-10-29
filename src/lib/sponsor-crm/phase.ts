import type {
  SponsorActivityExpanded,
  SponsorForConferenceExpanded,
} from './types'

export type SponsorPhase =
  | 'Prospect'
  | 'Contacted'
  | 'Negotiating'
  | 'Won – registration'
  | 'Won – contract'
  | 'Won – invoice'
  | 'Paid'
  | 'Lost'

type PhaseInput = Pick<
  SponsorForConferenceExpanded,
  | 'status'
  | 'contractStatus'
  | 'signatureStatus'
  | 'invoiceStatus'
  | 'registrationComplete'
>

/**
 * The deal's phase in plain words, read from the four state-machine axes
 * (pipeline, contract, signature, invoice). Pipeline decides until the deal
 * is won; after that the furthest step reached on the other axes decides.
 */
export function sponsorPhase(sponsor: PhaseInput): SponsorPhase {
  switch (sponsor.status) {
    case 'closed-lost':
      return 'Lost'
    case 'closed-won':
      break
    case 'contacted':
      return 'Contacted'
    case 'negotiating':
      return 'Negotiating'
    default:
      return 'Prospect'
  }
  if (sponsor.invoiceStatus === 'paid') return 'Paid'
  if (
    sponsor.contractStatus === 'contract-signed' ||
    sponsor.signatureStatus === 'signed'
  )
    return 'Won – invoice'
  // A finished registration alone stays "Won – registration": the contract
  // phase starts when the contract is sent.
  if (sponsor.contractStatus === 'contract-sent') return 'Won – contract'
  return 'Won – registration'
}

export interface TimelineStep {
  key: string
  label: string
  /** ISO instant, when known. A reached step may have no date (older data). */
  date?: string
  reached: boolean
}

type TimelineInput = PhaseInput &
  Pick<
    SponsorForConferenceExpanded,
    | 'contactInitiatedAt'
    | 'registrationCompletedAt'
    | 'contractSentAt'
    | 'contractSignedAt'
    | 'invoiceSentAt'
    | 'invoicePaidAt'
  >

type ActivityInput = Pick<
  SponsorActivityExpanded,
  'activityType' | 'createdAt' | 'metadata'
>

/**
 * The dated steps of a deal. Stored timestamps win; the activity log fills
 * the gaps (and is the only source for Won and Lost). A lost deal ends with
 * a Lost step and drops the steps it never reached.
 */
export function sponsorTimeline(
  sponsor: TimelineInput,
  activities: ActivityInput[] = [],
): TimelineStep[] {
  // Latest matching log entry, so a deal reopened and re-won shows the last date.
  const logged = (type: string, newValue?: string) =>
    activities
      .filter(
        (a) =>
          a.activityType === type &&
          (newValue === undefined || a.metadata?.newValue === newValue),
      )
      .map((a) => a.metadata?.timestamp || a.createdAt)
      .sort()
      .at(-1)

  const won = sponsor.status === 'closed-won'
  const contract = sponsor.contractStatus
  const invoice = sponsor.invoiceStatus
  const signed =
    contract === 'contract-signed' || sponsor.signatureStatus === 'signed'

  const steps: TimelineStep[] = [
    {
      key: 'contacted',
      label: 'Contacted',
      date:
        sponsor.contactInitiatedAt ||
        logged('stage_change', 'contacted') ||
        undefined,
      reached: ['contacted', 'negotiating', 'closed-won'].includes(
        sponsor.status,
      ),
    },
    {
      key: 'won',
      label: 'Won',
      date: logged('stage_change', 'closed-won'),
      reached: won,
    },
    {
      key: 'registered',
      label: 'Registered',
      date:
        sponsor.registrationCompletedAt ||
        logged('registration_complete') ||
        undefined,
      reached: Boolean(sponsor.registrationComplete),
    },
    {
      key: 'contract-sent',
      label: 'Contract sent',
      date:
        sponsor.contractSentAt ||
        logged('contract_status_change', 'contract-sent') ||
        undefined,
      reached: contract === 'contract-sent' || signed,
    },
    {
      key: 'signed',
      label: 'Signed',
      date:
        sponsor.contractSignedAt ||
        logged('contract_signed') ||
        logged('contract_status_change', 'contract-signed') ||
        undefined,
      reached: signed,
    },
    {
      key: 'invoiced',
      label: 'Invoiced',
      date:
        sponsor.invoiceSentAt ||
        logged('invoice_status_change', 'sent') ||
        undefined,
      reached: ['sent', 'overdue', 'paid'].includes(invoice),
    },
    {
      key: 'paid',
      label: 'Paid',
      date:
        sponsor.invoicePaidAt ||
        logged('invoice_status_change', 'paid') ||
        undefined,
      reached: invoice === 'paid',
    },
  ].map((step) => ({ ...step, reached: step.reached || Boolean(step.date) }))

  if (sponsor.status !== 'closed-lost') return steps
  return [
    ...steps.filter((s) => s.reached),
    {
      key: 'lost',
      label: 'Lost',
      date: logged('stage_change', 'closed-lost'),
      reached: true,
    },
  ]
}
