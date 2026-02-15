import { defineMigration } from 'sanity/migrate'

const ORPHANED_TALK_IDS = [
  '718a8937-2bb1-4769-b6c1-666c18ac496d', // TBD
  '553967fa-9f83-4fd8-a59c-0f15a269767b', // Awesome presentation 2 (invalid format: workshop_4h)
  'eca71842-1b1e-4606-a07d-3c7f4a44f311', // Checkin
  'a963ff41-917d-4ec7-a9af-a68b88031241', // Lunch placeholder
  '9c47088e-e7cf-49c7-aaab-1815d43a4097', // Tapas and Drinks placeholder
]

export default defineMigration({
  title: 'Remove orphaned draft talks',
  description:
    'Removes orphaned talk documents that are placeholders or have invalid formats, and are not referenced by any schedule.',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      if (ORPHANED_TALK_IDS.includes(doc._id)) {
        console.log(`Deleting orphaned talk "${doc.title}" (${doc._id})`)
        return [{ type: 'delete' as const, id: doc._id }]
      }
      return []
    },
  },
})
