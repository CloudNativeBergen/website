import { defineMigration, at, patch, set } from 'sanity/migrate'
import { normalizeEmail } from '../../src/lib/speaker/email'

/**
 * Seeds `knownEmails = [normalizeEmail(email)]` on speakers that have signed
 * in (`providers` non-empty) but have no `knownEmails` yet (#807). Since #807
 * the display `email` only matches a speaker WITHOUT `knownEmails`, so these
 * speakers keep matching on the address they signed in with. Invited
 * placeholders (no providers) are left alone: they still claim by display
 * email. Each patch carries `ifRevision`.
 *
 * Dry run by default (`sanity migration run 059-speaker-known-emails-backfill`);
 * add `--no-dry-run` to write.
 */

export interface SpeakerDoc {
  _id: string
  _rev: string
  _type: string
  email?: string
  providers?: string[]
  knownEmails?: string[]
}

/** The `knownEmails` to seed, or null when the speaker is out of scope. */
export function backfillFor(doc: SpeakerDoc): string[] | null {
  if (!doc.providers?.length) return null
  if (doc.knownEmails?.length) return null
  const email = normalizeEmail(doc.email)
  return email ? [email] : null
}

export default defineMigration({
  title: 'Backfill speaker knownEmails',
  description:
    'Seeds knownEmails from the display email on signed-in speakers that have none. Leaves placeholders alone.',
  documentTypes: ['speaker'],

  async *migrate(documents) {
    let written = 0
    for await (const raw of documents()) {
      const doc = raw as unknown as SpeakerDoc
      if (doc._id.startsWith('drafts.') || doc._id.startsWith('versions.'))
        continue
      const knownEmails = backfillFor(doc)
      if (!knownEmails) continue
      console.log(`  ✓ ${doc._id}`)
      yield patch(doc._id, [at('knownEmails', set(knownEmails))], {
        ifRevision: doc._rev,
      })
      written++
    }
    console.log(`\n=== Summary: ${written} speakers get knownEmails ===`)
  },
})
