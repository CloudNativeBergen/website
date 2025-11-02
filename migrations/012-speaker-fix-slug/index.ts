import { at, defineMigration, set } from 'sanity/migrate'

interface Speaker {
  _id: string
  _type: 'speaker'
  name: string
  slug?: string | { current: string; _type: 'slug' }
}

export default defineMigration({
  title: 'Fix speaker slug format from string to object',
  documentTypes: ['speaker'],

  migrate: {
    document(doc, context) {
      const speaker = doc as unknown as Speaker
      const operations = []

      // Check if slug is a string instead of an object
      if (speaker.slug && typeof speaker.slug === 'string') {
        console.log(
          `Converting slug from string to object for speaker ${speaker._id} (${speaker.name})`,
        )
        console.log(`  Old slug (string): "${speaker.slug}"`)

        // Convert string slug to proper slug object
        operations.push(
          at('slug', set({ _type: 'slug', current: speaker.slug })),
        )
      }

      return operations
    },
  },
})
