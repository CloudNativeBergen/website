import { defineType, defineField } from 'sanity'

/**
 * DOMAIN LOCK for a provisioning request (#777).
 *
 * Created in the tenant transaction, one per claimed domain, at
 * `provisioningDomainLock.<sha256(normalized domain)>`. Two provisions racing
 * on the same domain collide on the `create`, so only one commits. Expires
 * after ten minutes: by then the winner's conference claims the domain and the
 * ordinary read check covers it. Purged by the daily cleanup cron; hidden from
 * the Studio structure (see `STUDIO_HIDDEN_TYPES`).
 */
export default defineType({
  name: 'provisioningDomainLock',
  type: 'document',
  title: 'Provisioning domain lock (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({ name: 'domain', type: 'string', readOnly: true }),
    defineField({ name: 'expiresAt', type: 'datetime', readOnly: true }),
  ],
  preview: { select: { title: 'domain', subtitle: 'expiresAt' } },
})
