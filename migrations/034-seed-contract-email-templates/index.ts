import { defineMigration, createIfNotExists } from 'sanity/migrate'

function textBlock(text: string, key: string): Record<string, unknown> {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: `${key}-span`,
        text,
        marks: [],
      },
    ],
  }
}

const TEMPLATES = [
  {
    _id: 'template-contract-sent',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Contract Sent (English)',
    slug: { _type: 'slug', current: 'contract-sent' },
    category: 'contract',
    subject: 'Sponsorship contract: {{{CONFERENCE_TITLE}}}',
    description:
      'Sent to the sponsor when a contract is generated and shared for signing',
    is_default: true,
    sort_order: 20,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        'Please find attached the sponsorship contract for {{{CONFERENCE_TITLE}}}.',
        'b2',
      ),
      textBlock(
        'The contract covers your {{{TIER_NAME}}} sponsorship at {{{CONTRACT_VALUE}}} {{{CONTRACT_CURRENCY}}}.',
        'b3',
      ),
      textBlock(
        'Please review and sign the contract at your earliest convenience. If you have any questions, feel free to reply to this email.',
        'b4',
      ),
      textBlock('Best regards,', 'b5'),
      textBlock('{{{SENDER_NAME}}}', 'b6'),
    ],
  },
  {
    _id: 'template-contract-reminder',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Contract Reminder (English)',
    slug: { _type: 'slug', current: 'contract-reminder' },
    category: 'contract',
    subject: 'Reminder: Sponsorship contract for {{{CONFERENCE_TITLE}}}',
    description: 'Follow-up reminder for unsigned contracts',
    is_default: false,
    sort_order: 21,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        'This is a friendly reminder that we are still awaiting your signed sponsorship contract for {{{CONFERENCE_TITLE}}}.',
        'b2',
      ),
      textBlock(
        'The contract was sent on {{{CONTRACT_SENT_DATE}}}. If you need a new copy or have any questions, please let us know.',
        'b3',
      ),
      textBlock('Best regards,', 'b4'),
      textBlock('{{{SENDER_NAME}}}', 'b5'),
    ],
  },
  {
    _id: 'template-contract-signed',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Contract Signed Confirmation (English)',
    slug: { _type: 'slug', current: 'contract-signed' },
    category: 'contract',
    subject: 'Contract confirmed \u2013 Welcome aboard {{{CONFERENCE_TITLE}}}!',
    description:
      'Confirmation sent to the sponsor after the contract has been signed',
    is_default: false,
    sort_order: 22,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        'Thank you for signing the sponsorship contract for {{{CONFERENCE_TITLE}}}! We are thrilled to have {{{SPONSOR_NAME}}} on board.',
        'b2',
      ),
      textBlock(
        'Next steps: We will send you an onboarding link shortly where you can provide company details, logos, and contact information for the event.',
        'b3',
      ),
      textBlock(
        'If you have any questions in the meantime, don\u0027t hesitate to reach out.',
        'b4',
      ),
      textBlock('Best regards,', 'b5'),
      textBlock('{{{SENDER_NAME}}}', 'b6'),
    ],
  },
]

export default defineMigration({
  title: 'Seed contract email templates',
  documentTypes: ['sponsorEmailTemplate'],

  async *migrate() {
    for (const template of TEMPLATES) {
      yield createIfNotExists(template)
    }
  },
})
