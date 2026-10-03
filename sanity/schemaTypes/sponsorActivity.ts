import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsorActivity',
  title: 'Sponsor Activity',
  type: 'document',
  fields: [
    defineField({
      name: 'sponsorForConference',
      title: 'Sponsor for Conference',
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'activityType',
      title: 'Activity Type',
      type: 'string',
      options: {
        list: [
          { title: 'Stage Change', value: 'stage_change' },
          { title: 'Invoice Status Change', value: 'invoice_status_change' },
          { title: 'Contract Status Change', value: 'contract_status_change' },
          { title: 'Contract Signed', value: 'contract_signed' },
          { title: 'Note', value: 'note' },
          { title: 'Email', value: 'email' },
          { title: 'Call', value: 'call' },
          { title: 'Meeting', value: 'meeting' },
          // A sponsor↔organizer thread message was posted (messaging G2b).
          { title: 'Message', value: 'message' },
          // Already in the TS `ActivityType` union and written by the CRM; the
          // schema list lagged behind, so Studio showed them as unknown values.
          {
            title: 'Signature Status Change',
            value: 'signature_status_change',
          },
          { title: 'Registration Complete', value: 'registration_complete' },
          { title: 'Contract Reminder Sent', value: 'contract_reminder_sent' },
          {
            title: 'Discount Codes Assigned',
            value: 'discount_codes_assigned',
          },
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      validation: (Rule) => Rule.required(),
      rows: 3,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      description: 'Structured data for the activity (old/new values, etc.)',
      fields: [
        defineField({
          name: 'oldValue',
          title: 'Old Value',
          type: 'string',
        }),
        defineField({
          name: 'newValue',
          title: 'New Value',
          type: 'string',
        }),
        defineField({
          name: 'timestamp',
          title: 'Timestamp',
          type: 'string',
        }),
        defineField({
          name: 'additionalData',
          title: 'Additional Data',
          type: 'text',
        }),
      ],
    }),
    // ── Sent-communication audit (#1261) ─────────────────────────────────
    // An `email` activity written by `crm.sendCommunication` carries the full
    // record of what left the building: who it went to, the rendered content
    // exactly as sent, which template it started from, and the provider id.
    // `communicationKind` is the discriminator — present ⇒ this is an immutable
    // audit record, and the edit/delete gating refuses it. The list projection
    // deliberately leaves `body` and `attachments` out; they load on expand.
    defineField({
      name: 'communicationKind',
      title: 'Communication Kind',
      type: 'string',
      options: {
        list: [
          { title: 'Information', value: 'information' },
          { title: 'Contract', value: 'contract' },
          { title: 'Registration', value: 'registration' },
          { title: 'Discount codes', value: 'discount' },
        ],
        layout: 'dropdown',
      },
      readOnly: true,
    }),
    defineField({
      name: 'recipients',
      title: 'Recipients',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          name: 'communicationRecipient',
          fields: [
            defineField({
              name: 'contactKey',
              title: 'Contact Key',
              type: 'string',
            }),
            defineField({ name: 'name', title: 'Name', type: 'string' }),
            defineField({ name: 'email', title: 'Email', type: 'string' }),
            defineField({ name: 'role', title: 'Role', type: 'string' }),
            defineField({
              name: 'isDefault',
              title: 'Default recipient',
              type: 'boolean',
              description:
                'True when this contact was the sponsor’s primary contact at send time.',
            }),
          ],
          preview: {
            select: { name: 'name', email: 'email', role: 'role' },
            prepare({ name, email, role }) {
              return {
                title: name || email,
                subtitle: [role, email].filter(Boolean).join(' · '),
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'subject',
      title: 'Subject (as sent)',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'body',
      title: 'Body (rendered HTML, as sent)',
      type: 'text',
      readOnly: true,
      rows: 6,
    }),
    defineField({
      name: 'template',
      title: 'Template',
      type: 'reference',
      to: [{ type: 'sponsorEmailTemplate' }],
      readOnly: true,
      weak: true,
    }),
    defineField({
      name: 'templateEdited',
      title: 'Edited before sending',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments and links',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          name: 'communicationAttachment',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string' }),
            defineField({ name: 'url', title: 'URL', type: 'url' }),
          ],
        },
      ],
    }),
    defineField({
      name: 'providerMessageId',
      title: 'Provider Message Id',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'deliveryStatus',
      title: 'Delivery Status',
      type: 'string',
      options: {
        list: [
          { title: 'Sent', value: 'sent' },
          { title: 'Failed', value: 'failed' },
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: 'error',
      title: 'Error',
      type: 'text',
      readOnly: true,
      rows: 2,
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      description:
        'The organizer who performed this action. Omitted for system-generated activities.',
      options: {
        filter: '_id in *[_type == \"conference\"].organizers[]._ref',
      },
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
    // DENORMALIZED multi-tenant owner (CaaS T1-1, #613). This doc hangs off a
    // sponsorForConference (which carries the conference) and has no conference
    // key of its own. Document-level security (#614) can't traverse references,
    // so the tenant key is copied down here at creation (derived from the parent
    // sponsorForConference's conference). Additive/optional until 044 backfill.
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      description:
        'Denormalized organization (tenant) owner, copied from the parent sponsor-for-conference at creation for reference-blind document security.',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      activityType: 'activityType',
      description: 'description',
      createdBy: 'created_by.name',
      createdAt: 'createdAt',
    },
    prepare({ activityType, description, createdBy, createdAt }) {
      const typeLabel =
        activityType
          ?.split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ') || 'Activity'

      return {
        title: typeLabel,
        subtitle: `${description || 'No description'} | By ${createdBy || 'Unknown'} on ${createdAt ? new Date(createdAt).toLocaleDateString() : 'Unknown date'}`,
      }
    },
  },
  orderings: [
    {
      title: 'Created Date (Newest first)',
      name: 'createdAtDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
    {
      title: 'Created Date (Oldest first)',
      name: 'createdAtAsc',
      by: [{ field: 'createdAt', direction: 'asc' }],
    },
    {
      title: 'Activity Type',
      name: 'activityType',
      by: [
        { field: 'activityType', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
  ],
})
