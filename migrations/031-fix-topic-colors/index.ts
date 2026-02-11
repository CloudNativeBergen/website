import { at, defineMigration, set } from 'sanity/migrate'

export default defineMigration({
  title: 'Fix topic colors to include # prefix',
  description:
    'Adds the # prefix to topic color values that are missing it, to comply with hex color validation.',
  documentTypes: ['topic'],

  migrate: {
    document(doc) {
      const color = doc.color as string | undefined
      if (color && !color.startsWith('#')) {
        const fixed = `#${color}`
        console.log(
          `Fixing color for topic "${doc.title}": ${color} → ${fixed}`,
        )
        return [at('color', set(fixed))]
      }
      return []
    },
  },
})
