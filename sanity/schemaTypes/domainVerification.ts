import { defineField, defineType } from 'sanity'

/**
 * PROOF OF CONTROL for one claimed `domains[]` entry (#683).
 *
 * Deliberately a SIDECAR document rather than a reshape of `conference.domains[]`:
 * that array is the tenant ROUTING key and is read by `getConferenceForDomain`'s
 * GROQ, the overlap matcher, `createEdition`, onboarding, the PWA manifest and
 * the admin editor. Turning it into an array of objects would touch every one of
 * those at once — including the live routing query — for no gain, since
 * verification state is written by a background job on a completely different
 * cadence than the claim itself. Keeping them apart also means a verification
 * write can never corrupt routing data.
 *
 * ONE document per hostname, addressed by a deterministic `_id`
 * (`domainVerification.<encoded hostname>`) so the hostname→record mapping is
 * unique by construction (matching the global uniqueness `domains[]` already
 * enforces) and `createIfNotExists` is idempotent.
 *
 * The `conference` reference records WHO holds the claim. When a hostname is
 * released and re-claimed by a different conference the record is RESET (fresh
 * token, status back to `pending`) — the new holder must never inherit the old
 * holder's proof.
 */
export default defineType({
  name: 'domainVerification',
  title: 'Domain Verification',
  type: 'document',
  fields: [
    defineField({
      name: 'hostname',
      title: 'Hostname',
      type: 'string',
      description:
        'The canonical `domains[]` entry this record proves. May be a `*.example.com` wildcard, in which case the proof is published on the base domain.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'The conference currently claiming this hostname.',
    }),
    defineField({
      name: 'token',
      title: 'Challenge Token',
      type: 'string',
      description:
        'Random per-hostname token. The tenant publishes it in a DNS TXT record; we re-resolve it forever.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending (never proven)', value: 'pending' },
          { title: 'Verified', value: 'verified' },
          { title: 'Failing (proof stopped resolving)', value: 'failing' },
          { title: 'Revoked (claim released)', value: 'revoked' },
        ],
        layout: 'radio',
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'method',
      title: 'Method',
      type: 'string',
      description:
        '`dns-txt` = proven by resolving the challenge record. `grandfathered` = pre-existing claim admitted at backfill time, trusted only until `graceUntil`. `platform-owned` = a subdomain of the platform’s own zone (PLATFORM_DOMAIN_SUFFIX), proven by construction and permanently — never a grace period.',
      options: {
        list: [
          { title: 'DNS TXT challenge', value: 'dns-txt' },
          { title: 'Grandfathered (backfilled)', value: 'grandfathered' },
          { title: 'Platform-owned subdomain', value: 'platform-owned' },
        ],
        layout: 'radio',
      },
      initialValue: 'dns-txt',
    }),
    defineField({
      name: 'graceUntil',
      title: 'Grace Until',
      type: 'datetime',
      description:
        'Grandfathered claims only: the deadline by which a real DNS proof must exist. After it passes the record is treated as unproven.',
    }),
    defineField({
      name: 'verifiedAt',
      title: 'First Verified At',
      type: 'datetime',
    }),
    defineField({
      name: 'lastSuccessAt',
      title: 'Last Successful Check',
      type: 'datetime',
    }),
    defineField({
      name: 'lastCheckedAt',
      title: 'Last Checked At',
      type: 'datetime',
    }),
    defineField({
      name: 'firstFailureAt',
      title: 'First Failure At',
      type: 'datetime',
      description:
        'Start of the current failure streak — the routing grace period is measured from here.',
    }),
    defineField({
      name: 'consecutiveFailures',
      title: 'Consecutive Hard Failures',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'consecutiveSoftFailures',
      title: 'Consecutive Soft Failures',
      type: 'number',
      description:
        'Resolver timeouts / SERVFAILs — OUR problem, not the tenant’s. Counted separately so they never delist on their own until they persist.',
      initialValue: 0,
    }),
    defineField({
      name: 'lastError',
      title: 'Last Error',
      type: 'string',
    }),
  ],
  preview: {
    select: { title: 'hostname', subtitle: 'status' },
  },
})
