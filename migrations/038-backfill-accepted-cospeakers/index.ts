import { defineMigration, at, set } from 'sanity/migrate'
import { v4 as uuidv4 } from 'uuid'

interface SpeakerReference {
  _type: 'reference'
  _ref: string
  _key?: string
}

interface AcceptedInvitation {
  _id: string
  speakerId: string
}

export default defineMigration({
  title: 'Backfill accepted co-speakers onto talk speakers arrays',
  description:
    'A bug in the co-speaker invitation accept flow set invitations to ' +
    'status == "accepted" (with acceptedSpeaker) without appending the ' +
    "speaker to the referenced talk's speakers[] array. For every talk, " +
    'this migration appends keyed speaker references for accepted ' +
    'invitations whose speaker is missing from speakers[]. Idempotent: ' +
    'talks that already contain the speaker are left untouched.',
  documentTypes: ['talk'],

  migrate: {
    async document(doc, context) {
      const talk = doc as unknown as {
        _id: string
        speakers?: SpeakerReference[]
      }

      // Invitations reference the published talk id; strip the drafts.
      // prefix so a draft copy receives the same backfill and cannot
      // clobber the published speakers array on its next publish.
      const publishedId = talk._id.replace(/^drafts\./, '')

      try {
        const invitations = await context.client.fetch<AcceptedInvitation[]>(
          `*[_type == "coSpeakerInvitation"
              && proposal._ref == $talkId
              && status == "accepted"
              && defined(acceptedSpeaker._ref)]{
            _id,
            "speakerId": acceptedSpeaker._ref
          }`,
          { talkId: publishedId },
        )

        if (!invitations || invitations.length === 0) {
          return []
        }

        const existingRefs = new Set(
          (talk.speakers ?? []).map((speaker) => speaker._ref),
        )
        const missingIds = [
          ...new Set(invitations.map((invitation) => invitation.speakerId)),
        ].filter((speakerId) => !existingRefs.has(speakerId))

        if (missingIds.length === 0) {
          console.log(
            `  - Skipping ${talk._id}: all accepted co-speakers already present`,
          )
          return []
        }

        // Guard against dangling acceptedSpeaker references
        const existingSpeakerIds = await context.client.fetch<string[]>(
          `*[_type == "speaker" && _id in $ids]._id`,
          { ids: missingIds },
        )
        const validIds = missingIds.filter((speakerId) =>
          existingSpeakerIds.includes(speakerId),
        )
        for (const danglingId of missingIds.filter(
          (speakerId) => !existingSpeakerIds.includes(speakerId),
        )) {
          console.warn(
            `  ⚠ Skipping speaker ${danglingId} on talk ${talk._id}: speaker document not found`,
          )
        }

        if (validIds.length === 0) {
          return []
        }

        console.log(
          `  ✓ Appending ${validIds.length} accepted co-speaker(s) to talk ${talk._id}: ${validIds.join(', ')}`,
        )

        const appended: SpeakerReference[] = [
          ...(talk.speakers ?? []),
          ...validIds.map((speakerId) => ({
            _type: 'reference' as const,
            _ref: speakerId,
            _key: `speaker-${uuidv4()}`,
          })),
        ]

        return [at('speakers', set(appended))]
      } catch (error) {
        console.error(`  ✗ Failed to process talk ${talk._id}: ${error}`)
        return []
      }
    },
  },
})
