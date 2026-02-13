import { defineField, defineType } from 'sanity'

/**
 * Shared GDPR data processing consent object.
 * Used by both `speaker.consent.dataProcessing` and `volunteer.consent.dataProcessing`.
 */
export default defineType({
  name: 'dataProcessingConsent',
  title: 'Data Processing Consent',
  type: 'object',
  fields: [
    defineField({
      name: 'granted',
      title: 'Consent Granted',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'grantedAt',
      title: 'Consent Granted At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'ipAddress',
      title: 'IP Address',
      type: 'string',
      readOnly: true,
      description: 'IP address when consent was granted (for audit purposes)',
    }),
  ],
})
