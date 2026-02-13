import { defineMigration, at, set, del } from 'sanity/migrate'

interface TalkDoc {
  conference?: { _ref: string }
}

export default defineMigration({
  title: 'Add conference reference to review documents',
  description:
    'Backfills conference reference on review documents by resolving proposal._ref → talk.conference._ref. ' +
    'This enables conference-scoped review queries and eliminates cross-conference data leakage.',
  documentTypes: ['review'],

  migrate: {
    async document(doc, context) {
      const review = doc as unknown as {
        _id: string
        proposal?: { _ref: string }
        conference?: { _ref: string }
      }

      if (review.conference?._ref) {
        console.log(`  - Skipping ${review._id}: conference already set`)
        return []
      }

      if (!review.proposal?._ref) {
        console.warn(
          `  🗑 Deleting orphaned review ${review._id}: no proposal reference`,
        )
        return [del(review._id)]
      }

      try {
        const talk = await context.client.fetch<TalkDoc | null>(
          `*[_type == "talk" && _id == $talkId][0]{ conference }`,
          { talkId: review.proposal._ref },
        )

        if (!talk?.conference?._ref) {
          console.warn(
            `  🗑 Deleting orphaned review ${review._id}: proposal ${review.proposal._ref} has no conference`,
          )
          return [del(review._id)]
        }

        console.log(
          `  ✓ Setting conference ${talk.conference._ref} on review ${review._id}`,
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
        console.error(`  ✗ Failed to process review ${review._id}: ${error}`)
        return []
      }
    },
  },
})
