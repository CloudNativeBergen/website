import { defineType, defineField } from 'sanity'

/**
 * RECOVERY SNAPSHOT for a completed speaker merge (#1027 item 9).
 *
 * `speaker.admin.merge` deletes the loser document. Before this existed the only
 * record was a `console.info` carrying COUNTS — the discarded values themselves
 * were gone, and the deleted person was unrecoverable outside Sanity's dataset
 * history. One of these is created INSIDE the merge transaction (ordered before
 * the loser `delete`, which stays last), so a failed merge leaves no log and a
 * committed merge always has one.
 *
 * THERE IS NO UNDO. Deliberately: reversing a merge means un-repointing every
 * reference in documents that have since been edited, and re-creating a document
 * whose id other tenants may meanwhile have re-used. This is a SNAPSHOT ONLY —
 * recovery is a human reading `snapshot` and re-creating what they need by hand.
 * Do not build a restore action on top of it without solving the re-pointing
 * problem first.
 *
 * TENANCY: `organization` is the request's org, taken from the value
 * `requireSpeakerInCurrentOrg(..., { requireExclusive: true })` returns for the
 * SURVIVOR. That is unambiguous precisely because the merge demands exclusivity:
 * a merge only commits when no other org has standing over either speaker. It is
 * the standard direct-owner dimension (`organization._ref`) that
 * `getDocumentTenant` and the org-scoped reads already use, so any read of these
 * logs can — and must — filter on it. The document holds another person's email,
 * bio and possibly gender/country; an unscoped read is a cross-tenant PII leak.
 *
 * RETENTION IS AN OPEN QUESTION (#1027). These carry personal data indefinitely,
 * which sits badly next to this repo's GDPR-first posture and its document-count
 * quota doctrine. No sweeper is wired up yet, on purpose — the retention window
 * is a decision, not an implementation detail. Candidates: purge with the daily
 * cleanup cron at N days; or drop `snapshot` (leaving the counts) at N days so
 * the audit trail outlives the PII. Until one is chosen these accumulate.
 */
export default defineType({
  name: 'speakerMergeLog',
  type: 'document',
  title: 'Speaker Merge Log',
  fields: [
    defineField({
      name: 'organization',
      type: 'reference',
      title: 'Organization',
      to: [{ type: 'organization' }],
      description:
        'The tenant whose organizer performed the merge. The scoping key: ' +
        'never read these logs without filtering on it.',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'mergedAt',
      type: 'datetime',
      title: 'Merged At',
      readOnly: true,
    }),
    defineField({
      name: 'actorId',
      type: 'string',
      title: 'Actor speaker id',
      description: 'The organizer who performed the merge.',
      readOnly: true,
    }),
    defineField({
      name: 'actorName',
      type: 'string',
      title: 'Actor name',
      description:
        'Name snapshot, so the log stays readable if they change it.',
      readOnly: true,
    }),
    // Plain STRINGS, not references, for both speaker ids. A reference would
    // make this audit record part of the reference graph: a later merge of the
    // survivor would silently REWRITE the log (an audit record that moves is not
    // one), and `foreignReferencingDocCount` would count it when deciding
    // whether a speaker is exclusive enough to merge at all.
    defineField({
      name: 'survivorId',
      type: 'string',
      title: 'Survivor speaker id',
      readOnly: true,
    }),
    defineField({
      name: 'loserId',
      type: 'string',
      title: 'Deleted (duplicate) speaker id',
      readOnly: true,
    }),
    defineField({
      name: 'snapshot',
      type: 'text',
      title: 'Snapshot (JSON)',
      description:
        'JSON: { loser } the COMPLETE deleted document as stored — the recovery ' +
        'artifact; { survivorBefore } the survivor values the merge overwrote; ' +
        '{ fields } which side each selectable field came from plus the ' +
        'recommendation and reason the server computed; { references } the ' +
        'repoint summary. Opaque JSON rather than typed fields so it stays a ' +
        'faithful copy when the speaker schema changes.',
      readOnly: true,
    }),
  ],
  preview: {
    select: { loserId: 'loserId', survivorId: 'survivorId', at: 'mergedAt' },
    prepare: ({ loserId, survivorId, at }) => ({
      title: `${loserId ?? '?'} → ${survivorId ?? '?'}`,
      subtitle: at ?? '',
    }),
  },
})
