import { defineMigration, at, set, del } from 'sanity/migrate'

interface ConferenceRef {
  _id: string
  title?: string
}

export default defineMigration({
  title: 'Add conference reference to schedule documents',
  description:
    'Backfills conference reference on schedule documents by finding which conference ' +
    'references each schedule in its schedules[] array. ' +
    'This enables conference-scoped schedule queries instead of scanning all schedules.',
  documentTypes: ['schedule'],

  migrate: {
    async document(doc, context) {
      const schedule = doc as unknown as {
        _id: string
        conference?: { _ref: string }
      }

      if (schedule.conference?._ref) {
        console.log(`  - Skipping ${schedule._id}: conference already set`)
        return []
      }

      try {
        const conferences = await context.client.fetch<ConferenceRef[]>(
          `*[_type == "conference" && $scheduleId in schedules[]._ref]{ _id, title }`,
          { scheduleId: schedule._id },
        )

        if (!conferences || conferences.length === 0) {
          console.warn(
            `  🗑 Deleting orphaned schedule ${schedule._id}: not referenced by any conference`,
          )
          return [del(schedule._id)]
        }

        if (conferences.length > 1) {
          console.warn(
            `  ⚠ Schedule ${schedule._id} referenced by ${conferences.length} conferences, using first: ${conferences[0].title || conferences[0]._id}`,
          )
        }

        const conferenceId = conferences[0]._id
        console.log(
          `  ✓ Setting conference ${conferences[0].title || conferenceId} on schedule ${schedule._id}`,
        )

        return [
          at(
            'conference',
            set({
              _type: 'reference',
              _ref: conferenceId,
            }),
          ),
        ]
      } catch (error) {
        console.error(
          `  ✗ Failed to process schedule ${schedule._id}: ${error}`,
        )
        return []
      }
    },
  },
})
