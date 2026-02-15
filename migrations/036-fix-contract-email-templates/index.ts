import { defineMigration, createOrReplace } from 'sanity/migrate'

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
    language: 'en',
    subject: 'Sponsorship Agreement \u2014 {{{CONFERENCE_TITLE}}}',
    description:
      'Sent to the sponsor when a contract is generated and shared for signing',
    isDefault: true,
    sortOrder: 20,
    body: [
      textBlock('Dear {{{SIGNER_NAME}}},', 'b1'),
      textBlock(
        'Your sponsorship agreement for {{{CONFERENCE_TITLE}}} is ready for review and digital signing.',
        'b2',
      ),
      textBlock(
        'The link below is unique to your email address. Use it to review the full agreement and provide your digital signature.',
        'b3',
      ),
      textBlock(
        'If you have any questions or need assistance, simply reply to this email.',
        'b4',
      ),
    ],
  },
  {
    _id: 'template-contract-reminder',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Contract Reminder (English)',
    slug: { _type: 'slug', current: 'contract-reminder' },
    category: 'contract',
    language: 'en',
    subject: 'Reminder: Sponsorship Agreement \u2014 {{{CONFERENCE_TITLE}}}',
    description: 'Follow-up reminder for unsigned contracts',
    isDefault: true,
    sortOrder: 21,
    body: [
      textBlock('Dear {{{SIGNER_NAME}}},', 'b1'),
      textBlock(
        'Your sponsorship agreement for {{{CONFERENCE_TITLE}}} is still awaiting your signature. We\u2019d love to finalize the partnership \u2014 please take a moment to review and sign the document.',
        'b2',
      ),
      textBlock(
        'If you have any questions or need assistance, simply reply to this email.',
        'b3',
      ),
    ],
  },
  {
    _id: 'template-contract-signed',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Contract Signed Confirmation (English)',
    slug: { _type: 'slug', current: 'contract-signed' },
    category: 'contract',
    language: 'en',
    subject:
      'Agreement Confirmed \u2014 Welcome aboard {{{CONFERENCE_TITLE}}}!',
    description:
      'Confirmation sent to the sponsor after the contract has been signed',
    isDefault: true,
    sortOrder: 22,
    body: [
      textBlock('Dear {{{SIGNER_NAME}}},', 'b1'),
      textBlock(
        'Thank you for signing the sponsorship agreement for {{{CONFERENCE_TITLE}}}! We are thrilled to have {{{SPONSOR_NAME}}} on board as a partner.',
        'b2',
      ),
      textBlock(
        'A copy of the signed agreement is attached to this email for your records.',
        'b3',
      ),
      textBlock(
        'We look forward to a great partnership and an amazing event together!',
        'b4',
      ),
      textBlock(
        'If you have any questions or need assistance, simply reply to this email.',
        'b5',
      ),
    ],
  },
]

export default defineMigration({
  title: 'Fix contract email templates with correct variables',
  description:
    'Overwrites existing contract email templates that used wrong variable ' +
    'names (CONTACT_NAMES, SENDER_NAME, CONTRACT_CURRENCY) with the correct ' +
    'variables (SIGNER_NAME, SPONSOR_NAME, etc.)',
  documentTypes: ['sponsorEmailTemplate'],

  async *migrate() {
    for (const template of TEMPLATES) {
      yield createOrReplace(template)
    }
  },
})
