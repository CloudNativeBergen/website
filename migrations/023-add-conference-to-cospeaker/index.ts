import { defineMigration, at, set, del } from 'sanity/migrate'

interface TalkDoc {
  conference?: { _ref: string }
}

export default defineMigration({
  title: 'Add conference reference to coSpeakerInvitation documents',
  description:
    'Backfills conference reference on coSpeakerInvitation documents by resolving ' +
    'proposal._ref → talk.conference._ref. This enables conference-scoped invitation queries.',
  documentTypes: ['coSpeakerInvitation'],

  migrate: {
    async document(doc, context) {
      const invitation = doc as unknown as {
        _id: string
        proposal?: { _ref: string }
        conference?: { _ref: string }
      }

      if (invitation.conference?._ref) {
        console.log(`  - Skipping ${invitation._id}: conference already set`)
        return []
      }

      if (!invitation.proposal?._ref) {
        console.warn(
          `  🗑 Deleting orphaned invitation ${invitation._id}: no proposal reference`,
        )
        return [del(invitation._id)]
      }

      try {
        const talk = await context.client.fetch<TalkDoc | null>(
          `*[_type == "talk" && _id == $talkId][0]{ conference }`,
          { talkId: invitation.proposal._ref },
        )

        if (!talk?.conference?._ref) {
          console.warn(
            `  🗑 Deleting orphaned invitation ${invitation._id}: proposal ${invitation.proposal._ref} has no conference`,
          )
          return [del(invitation._id)]
        }

        console.log(
          `  ✓ Setting conference ${talk.conference._ref} on invitation ${invitation._id}`,
        )

        return [
          at(
            'conference',
            set({
              _type: 'reference',
              _ref: talk.conference._ref,
            }),
          ),
        ]
      } catch (error) {
        console.error(
          `  ✗ Failed to process invitation ${invitation._id}: ${error}`,
        )
        return []
      }
    },
  },
})
